import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Pinecone } from "@pinecone-database/pinecone";
import {
  EMBEDDING_DIMENSION,
  GEMINI_EMBEDDING_MODEL,
  GROQ_MODEL,
  UPLOAD_DIR,
} from "../config/appConfig.js";

const pinecone = new Pinecone();
const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

function normalizeHistory(history = []) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      (item) =>
        item &&
        (item.role === "user" || item.role === "model") &&
        typeof item.text === "string" &&
        item.text.trim(),
    )
    .map((item) => ({
      role: item.role,
      parts: [{ text: item.text.trim() }],
    }));
}

function groqHistoryMessages(history = []) {
  return normalizeHistory(history).map((item) => ({
    role: item.role === "model" ? "assistant" : "user",
    content: item.parts[0]?.text ?? "",
  }));
}

async function generateGroqText(systemInstruction, history = [], userPrompt) {
  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: GROQ_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemInstruction },
        ...groqHistoryMessages(history),
        { role: "user", content: userPrompt },
      ],
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
    },
  );

  return response.data?.choices?.[0]?.message?.content?.trim() ?? "";
}

function sanitizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeBy(items = [], getKey = (item) => item) {
  const seen = new Set();

  return items.filter((item) => {
    const key = getKey(item);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function safeJsonParse(text) {
  const cleaned = sanitizeText(text);

  if (!cleaned) {
    return null;
  }

  try {
    return JSON.parse(cleaned);
  } catch (_error) {
    const startIndex = cleaned.indexOf("{");
    const endIndex = cleaned.lastIndexOf("}");

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      return null;
    }

    try {
      return JSON.parse(cleaned.slice(startIndex, endIndex + 1));
    } catch (_nestedError) {
      return null;
    }
  }
}

async function embedQuery(text) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:embedContent`,
      {
        model: GEMINI_EMBEDDING_MODEL,
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: EMBEDDING_DIMENSION,
        content: {
          parts: [{ text }],
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
      },
    );

    return response.data.embedding?.values ?? [];
  } catch (error) {
    throw new Error(
      `Embedding API failed: ${error.response?.status} ${JSON.stringify(error.response?.data)}`,
    );
  }
}

async function batchEmbedQueries(texts) {
  const sanitizedTexts = texts.map(sanitizeText).filter(Boolean);

  if (sanitizedTexts.length === 0) {
    return [];
  }

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`,
      {
        requests: sanitizedTexts.map((text) => ({
          model: GEMINI_EMBEDDING_MODEL,
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: EMBEDDING_DIMENSION,
          content: {
            parts: [{ text }],
          },
        })),
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
      },
    );

    return (response.data.embeddings ?? []).map(
      (embedding) => embedding.values ?? [],
    );
  } catch (error) {
    throw new Error(
      `Embedding API failed: ${error.response?.status} ${JSON.stringify(error.response?.data)}`,
    );
  }
}

async function embedDocuments(texts) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/${GEMINI_EMBEDDING_MODEL}:batchEmbedContents`,
      {
        requests: texts.map((text) => ({
          model: GEMINI_EMBEDDING_MODEL,
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: EMBEDDING_DIMENSION,
          content: {
            parts: [{ text }],
          },
        })),
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY,
        },
      },
    );

    return (response.data.embeddings ?? []).map(
      (embedding) => embedding.values ?? [],
    );
  } catch (error) {
    throw new Error(
      `Embedding API failed: ${error.response?.status} ${JSON.stringify(error.response?.data)}`,
    );
  }
}

async function rewriteQuery(question, history = []) {
  try {
    const rewritten = await generateGroqText(
      "Rewrite the latest user question into a clear standalone search query. Return only the rewritten question.",
      history,
      question,
    );
    return rewritten || question;
  } catch (error) {
    console.warn(
      "Query rewrite failed, using original question.",
      error.response?.data || error.message,
    );
    return question;
  }
}

function buildFallbackAnswer(context, rewrittenQuery) {
  if (!context.trim()) {
    return "I could not find the answer in the provided document.";
  }

  const lines = context
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const queryWords = rewrittenQuery
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);

  const matchedLines = lines.filter((line) =>
    queryWords.some((word) => line.toLowerCase().includes(word)),
  );

  return (matchedLines.length > 0 ? matchedLines : lines)
    .slice(0, 6)
    .join("\n");
}

function normalizeMatch(match, index) {
  return {
    page: match.metadata?.pageNumber ?? "N/A",
    section: `Match ${index + 1}`,
    text: match.metadata?.text ?? "",
    score: match.score ?? null,
    source: match.metadata?.source ?? "",
  };
}

function formatComplianceReview(review) {
  const overallPercentage = Number.isFinite(review?.overallPercentage)
    ? Math.max(0, Math.min(100, Math.round(review.overallPercentage)))
    : 0;
  const summary = sanitizeText(review?.summary) || "No summary was generated.";
  const correctItems = Array.isArray(review?.correctItems)
    ? review.correctItems.map(sanitizeText).filter(Boolean)
    : [];
  const wrongItems = Array.isArray(review?.wrongItems)
    ? review.wrongItems.map(sanitizeText).filter(Boolean)
    : [];
  const lineReviews = Array.isArray(review?.lineReviews)
    ? review.lineReviews
    : [];

  const lines = [
    `Overall compliance: ${overallPercentage}%`,
    `Summary: ${summary}`,
    "",
    "What is correct:",
    ...(correctItems.length > 0
      ? correctItems.map((item) => `- ${item}`)
      : ["- No clearly correct items were identified from the provided text."]),
    "",
    "What is wrong or needs correction:",
    ...(wrongItems.length > 0
      ? wrongItems.map((item) => `- ${item}`)
      : ["- No major issues were highlighted from the provided text."]),
    "",
    "Line-by-line review:",
  ];

  if (lineReviews.length === 0) {
    lines.push("- No line-by-line review could be generated.");
    return lines.join("\n");
  }

  lineReviews.forEach((item, index) => {
    const lineNumber = Number.isFinite(item?.lineNumber)
      ? item.lineNumber
      : index + 1;
    const status = sanitizeText(item?.status || "not_found")
      .replace(/_/g, " ")
      .toUpperCase();
    const percentage = Number.isFinite(item?.percentage)
      ? Math.max(0, Math.min(100, Math.round(item.percentage)))
      : 0;
    const lineText = sanitizeText(item?.lineText) || "(empty line)";
    const explanation =
      sanitizeText(item?.explanation) || "No explanation was generated.";
    const supportingRule =
      sanitizeText(item?.supportingRule) || "No exact supporting rule was cited.";
    const sourceParts = [
      sanitizeText(item?.source),
      item?.page === 0 || item?.page ? `page ${item.page}` : "",
    ].filter(Boolean);

    lines.push(`${lineNumber}. [${status} - ${percentage}%] ${lineText}`);
    lines.push(`Why: ${explanation}`);
    lines.push(`Rule reference: ${supportingRule}`);
    if (sourceParts.length > 0) {
      lines.push(`Source: ${sourceParts.join(", ")}`);
    }
    lines.push("");
  });

  return lines.join("\n").trim();
}

function buildFallbackComplianceReview(submission, lineAnalyses = []) {
  const totalLines = lineAnalyses.length;
  const matchedLines = lineAnalyses.filter((line) => line.matches.length > 0);
  const overallPercentage =
    totalLines === 0 ? 0 : Math.round((matchedLines.length / totalLines) * 100);

  const correctItems = matchedLines
    .slice(0, 5)
    .map(
      (line) =>
        `Line ${line.lineNumber} appears supported by the documents: "${line.lineText}"`,
    );

  const wrongItems = lineAnalyses
    .filter((line) => line.matches.length === 0)
    .slice(0, 5)
    .map(
      (line) =>
        `Line ${line.lineNumber} could not be verified from the indexed rules: "${line.lineText}"`,
    );

  return {
    overallPercentage,
    summary:
      overallPercentage === 0
        ? "The submission could not be verified against the indexed rule documents."
        : "This fallback review is based on retrieval matches only because structured analysis generation was unavailable.",
    correctItems,
    wrongItems,
    lineReviews: lineAnalyses.map((line) => ({
      lineNumber: line.lineNumber,
      lineText: line.lineText,
      status: line.matches.length > 0 ? "partially_correct" : "not_found",
      percentage: line.matches.length > 0 ? 60 : 0,
      explanation:
        line.matches.length > 0
          ? "Relevant rule text was found, but the exact claim still needs a stronger model-based compliance review."
          : "No relevant rule text was found for this line in the indexed documents.",
      supportingRule: sanitizeText(line.matches[0]?.metadata?.text) || "",
      source: sanitizeText(line.matches[0]?.metadata?.source) || "",
      page: line.matches[0]?.metadata?.pageNumber ?? "N/A",
    })),
  };
}

async function retrieveMatches(queryVector, topK = 5) {
  const searchResults = await pineconeIndex.query({
    topK,
    vector: queryVector,
    includeMetadata: true,
  });

  return searchResults.matches ?? [];
}

export async function listUploadedDocuments() {
  const files = await fs.readdir(UPLOAD_DIR);

  const documents = await Promise.all(
    files
      .filter((fileName) => fileName.includes("__"))
      .map(async (fileName) => {
        const [docId, ...nameParts] = fileName.split("__");
        const originalName = nameParts.join("__");
        const filePath = path.join(UPLOAD_DIR, fileName);
        const stats = await fs.stat(filePath);

        return {
          docId,
          fileName: originalName,
          uploadedAt: stats.mtime.toISOString(),
          size: stats.size,
        };
      }),
  );

  return documents.sort(
    (first, second) =>
      new Date(second.uploadedAt).getTime() -
      new Date(first.uploadedAt).getTime(),
  );
}

export async function answerQuestion(question, history = []) {
  const rewrittenQuery = await rewriteQuery(question, history);
  const queryVector = await embedQuery(rewrittenQuery);

  if (!Array.isArray(queryVector) || queryVector.length === 0) {
    throw new Error("Embedding generation failed for the search query.");
  }

  const matches = await retrieveMatches(queryVector, 5);
  const context = matches
    .map((match) => match.metadata?.text)
    .filter(Boolean)
    .join("\n\n---\n\n");

  let answer = "";

  try {
    answer = await generateGroqText(
      `You are a helpful assistant that answers only from the provided PDF context.
If the answer is not available in the context, reply exactly with: I could not find the answer in the provided document.

Context:
${context}`,
      history,
      question,
    );

    if (!answer) {
      throw new Error("Groq returned an empty answer.");
    }
  } catch (error) {
    console.warn(
      "Groq answer generation failed, using fallback.",
      error.response?.data || error.message,
    );
    answer = buildFallbackAnswer(context, rewrittenQuery);
  }

  return {
    answer,
    sources: matches.map(normalizeMatch),
  };
}

export async function analyzeSubmissionAgainstRules(submission, history = []) {
  const normalizedSubmission = sanitizeText(submission);

  if (!normalizedSubmission) {
    throw new Error("Submission text is required for compliance review.");
  }

  const submissionLines = normalizedSubmission
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 25)
    .map((lineText, index) => ({
      lineNumber: index + 1,
      lineText,
    }));

  if (submissionLines.length === 0) {
    throw new Error("Submission text must contain at least one non-empty line.");
  }

  const queryVectors = await batchEmbedQueries(
    submissionLines.map((line) => line.lineText),
  );

  const lineAnalyses = await Promise.all(
    submissionLines.map(async (line, index) => {
      const queryVector = queryVectors[index] ?? [];

      if (!Array.isArray(queryVector) || queryVector.length === 0) {
        return {
          ...line,
          matches: [],
        };
      }

      const matches = await retrieveMatches(queryVector, 2);

      return {
        ...line,
        matches,
      };
    }),
  );

  const reviewContext = lineAnalyses
    .map((line) => {
      const evidence = line.matches
        .map((match, index) => {
          const page =
            match.metadata?.pageNumber === 0 || match.metadata?.pageNumber
              ? `page ${match.metadata.pageNumber}`
              : "page N/A";

          return [
            `Evidence ${index + 1}:`,
            `source=${sanitizeText(match.metadata?.source) || "unknown"}`,
            `${page}`,
            `score=${typeof match.score === "number" ? match.score.toFixed(4) : "N/A"}`,
            `text=${sanitizeText(match.metadata?.text) || "No text"}`,
          ].join(" | ");
        })
        .join("\n");

      return `Line ${line.lineNumber}: ${line.lineText}\n${evidence || "Evidence: none"}`;
    })
    .join("\n\n");

  let parsedReview = null;

  try {
    const rawReview = await generateGroqText(
      `You are a strict compliance reviewer.
Review the user's submission against the supplied rule evidence only.
Do not invent rules that are not in the evidence.
If a claim cannot be verified from the evidence, mark it as "not_found" or "incorrect".
Return valid JSON only with this shape:
{
  "overallPercentage": number,
  "summary": "short paragraph",
  "correctItems": ["bullet text"],
  "wrongItems": ["bullet text"],
  "lineReviews": [
    {
      "lineNumber": number,
      "lineText": "original line",
      "status": "correct|partially_correct|incorrect|not_found",
      "percentage": number,
      "explanation": "what is right or wrong",
      "supportingRule": "quote or paraphrase from the evidence",
      "source": "document file name",
      "page": "page number or N/A"
    }
  ]
}`,
      history,
      `Submission to review:
${normalizedSubmission}

Evidence by line:
${reviewContext}`,
    );

    parsedReview = safeJsonParse(rawReview);
  } catch (error) {
    console.warn(
      "Structured compliance review failed, using fallback.",
      error.response?.data || error.message,
    );
  }

  const review = parsedReview || buildFallbackComplianceReview(normalizedSubmission, lineAnalyses);
  const sources = dedupeBy(
    lineAnalyses.flatMap((line) => line.matches.map(normalizeMatch)),
    (item) => `${item.source}|${item.page}|${item.text}`,
  );

  return {
    answer: formatComplianceReview(review),
    review,
    sources,
  };
}

export async function findUploadedDocument(docId) {
  const files = await fs.readdir(UPLOAD_DIR);
  const fileName = files.find((file) => file.startsWith(`${docId}__`));
  return fileName ? path.join(UPLOAD_DIR, fileName) : null;
}

export async function processDocument(filePath, docId) {
  const pdfLoader = new PDFLoader(filePath);
  const rawDocs = await pdfLoader.load();
  const readableDocs = rawDocs.filter(
    (doc) =>
      typeof doc.pageContent === "string" && doc.pageContent.trim().length > 0,
  );

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  if (readableDocs.length === 0) {
    throw new Error(
      "The uploaded PDF does not contain readable text. Try a text-based PDF instead of an image/scanned PDF.",
    );
  }

  const chunkedDocs = await textSplitter.splitDocuments(readableDocs);
  const cleanedChunkedDocs = chunkedDocs.filter(
    (doc) =>
      typeof doc.pageContent === "string" && doc.pageContent.trim().length > 0,
  );

  if (cleanedChunkedDocs.length === 0) {
    throw new Error("No readable content was found in this PDF.");
  }

  const chunkTexts = cleanedChunkedDocs.map((doc) => doc.pageContent.trim());
  const vectors = await embedDocuments(chunkTexts);

  const records = cleanedChunkedDocs
    .map((doc, index) => ({
      id: `${docId}-${doc.metadata.loc?.pageNumber ?? "page"}-${index}`,
      values: vectors[index],
      metadata: {
        text: doc.pageContent.trim(),
        source: path.basename(filePath),
        pageNumber: doc.metadata.loc?.pageNumber ?? null,
        docId,
      },
    }))
    .filter(
      (record) => Array.isArray(record.values) && record.values.length > 0,
    );

  if (records.length === 0) {
    throw new Error(
      "Embeddings could not be created from this PDF content. Check the PDF text and Gemini embedding API quota.",
    );
  }

  await pineconeIndex.upsert({
    records,
  });

  return {
    chunkCount: records.length,
    pageCount: readableDocs.length,
  };
}
