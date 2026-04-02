import {
  analyzeSubmissionAgainstRules,
  answerQuestion,
} from "../services/ragService.js";
import UserChat from "../models/UserChat.js";

export async function queryKnowledgeBase(req, res) {
  try {
    const mode = req.body?.mode?.trim() || "chat";
    const query = req.body?.query?.trim();
    const submission = req.body?.submission?.trim();
    const history = req.body?.history ?? [];

    if (mode === "compliance_review" && !submission) {
      return res.status(400).json({
        success: false,
        error: "submission is required when mode is compliance_review.",
      });
    }

    if (mode !== "compliance_review" && !query) {
      return res.status(400).json({
        success: false,
        error: "Query is required.",
      });
    }

    const result =
      mode === "compliance_review"
        ? await analyzeSubmissionAgainstRules(submission, history)
        : await answerQuestion(query, history);
    const userMessage = mode === "compliance_review" ? submission : query;

    const chatItem = {
      mode,
      question: userMessage,
      answer: result.answer,
      sources: result.sources ?? [],
      askedAt: new Date(),
    };

    await UserChat.findOneAndUpdate(
      { userId: req.user._id },
      {
        $setOnInsert: { userId: req.user._id },
        $push: {
          chats: {
            $each: [chatItem],
            $slice: -100,
          },
        },
      },
      { upsert: true, new: true },
    );

    return res.json({
      success: true,
      mode,
      answer: result.answer,
      sources: result.sources,
      review: result.review,
      chat: chatItem,
    });
  } catch (error) {
    console.error("Query route failed:", error);
    return res.status(500).json({
      success: false,
      error:
        error.message || "Something went wrong while answering the question.",
    });
  }
}

export async function getUserChatHistory(req, res) {
  try {
    const userChat = await UserChat.findOne({ userId: req.user._id }).lean();

    return res.json({
      success: true,
      chats: userChat?.chats ?? [],
    });
  } catch (error) {
    console.error("Get chat history route failed:", error);
    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "Something went wrong while fetching the user's chat history.",
    });
  }
}
