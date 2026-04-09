import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clock3, MessageSquareText, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../lib/api.js';
import { useAuth } from '../hooks/useAuth.js';

const DashboardPage = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState({ chats: 0, documents: 0 });
  const [recentChats, setRecentChats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;

    const loadStats = async () => {
      try {
        setIsLoading(true);
        const requests = [api.get('/api/query/history')];

        if (user?.role === 'admin') {
          requests.push(api.get('/api/admin/documents'));
        }

        const [historyResponse, documentsResponse] = await Promise.all(requests);
        const chatSessions = historyResponse.data.chatSessions || [];
        const latestSessions = chatSessions
          .slice()
          .sort((a, b) => new Date(b.lastAskedAt || 0).getTime() - new Date(a.lastAskedAt || 0).getTime())
          .slice(0, 5);

        if (!isCancelled) {
          setStats({
            chats: chatSessions.length,
            documents: documentsResponse?.data?.documents?.length || 0,
          });
          setRecentChats(latestSessions);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    loadStats();

    return () => {
      isCancelled = true;
    };
  }, [user?.role]);

  const quickActions = useMemo(
    () => [
      {
        to: '/chat',
        title: 'Ask new question',
        description: 'Open chat workspace and query your indexed rules.',
        icon: MessageSquareText,
      },
      ...(user?.role === 'admin'
        ? [
            {
              to: '/admin',
              title: 'Upload rule documents',
              description: 'Add fresh PDFs to keep retrieval up to date.',
              icon: ShieldCheck,
            },
          ]
        : []),
    ],
    [user?.role],
  );

  return (
    <section className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="flex min-h-0 flex-col gap-4">
        <div className="premium-card rounded-xl p-5 dark:border-[#355269] dark:bg-[#1b2c3a]">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#6b7280] dark:text-[#a9c3d8]">Overview</p>
          <h2 className="mt-2 text-2xl font-semibold text-[#1a1a1a] dark:text-[#dce8f3]">Welcome back, {user?.fullName}</h2>
          <p className="mt-2 max-w-2xl text-sm text-[#6b7280] dark:text-[#a9c3d8]">
            This workspace gives you fast access to conversations, uploaded rule documents, and daily actions.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="premium-surface rounded-lg px-4 py-3 dark:border-[#355269] dark:bg-[#1d3344]">
              <p className="text-xs uppercase tracking-[0.08em] text-[#6b7280] dark:text-[#a9c3d8]">Saved chats</p>
              <p className="mt-1 text-2xl font-semibold text-[#1a1a1a] dark:text-[#dce8f3]">{isLoading ? '...' : stats.chats}</p>
            </div>
            <div className="premium-surface rounded-lg px-4 py-3 dark:border-[#355269] dark:bg-[#1d3344]">
              <p className="text-xs uppercase tracking-[0.08em] text-[#6b7280] dark:text-[#a9c3d8]">
                {user?.role === 'admin' ? 'Indexed PDFs' : 'Role'}
              </p>
              <p className="mt-1 text-2xl font-semibold text-[#1a1a1a] dark:text-[#dce8f3]">
                {user?.role === 'admin' ? (isLoading ? '...' : stats.documents) : user?.role}
              </p>
            </div>
            <div className="premium-surface rounded-lg px-4 py-3 dark:border-[#355269] dark:bg-[#1d3344]">
              <p className="text-xs uppercase tracking-[0.08em] text-[#6b7280] dark:text-[#a9c3d8]">Workspace</p>
              <p className="mt-1 text-2xl font-semibold text-[#1a1a1a] dark:text-[#dce8f3]">Active</p>
            </div>
          </div>
        </div>

        <div className="premium-card rounded-xl p-5 dark:border-[#355269] dark:bg-[#1b2c3a]">
          <h3 className="text-base font-semibold text-[#1a1a1a] dark:text-[#dce8f3]">Quick actions</h3>
          <div className="mt-3 grid gap-3">
            {quickActions.map(({ to, title, description, icon }) => (
              <Link
                key={to}
                to={to}
                className="premium-surface group flex items-center justify-between rounded-lg px-4 py-3 transition hover:border-[#b9d8f2] hover:bg-moss-50 dark:border-[#355269] dark:bg-[#1d3344] dark:hover:border-[#4f7391] dark:hover:bg-[#26465d]"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-moss-600 text-white dark:bg-[#a9d6f7] dark:text-[#0f2434]">
                    {React.createElement(icon, { size: 16 })}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#1a1a1a] dark:text-[#dce8f3]">{title}</p>
                    <p className="text-xs text-[#6b7280] dark:text-[#a9c3d8]">{description}</p>
                  </div>
                </div>
                <ArrowRight size={16} className="text-[#8a8f99] transition group-hover:translate-x-0.5 group-hover:text-moss-700 dark:group-hover:text-[#a9d6f7]" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="premium-card min-h-0 rounded-xl p-5 dark:border-[#355269] dark:bg-[#1b2c3a]">
        <h3 className="text-base font-semibold text-[#1a1a1a] dark:text-[#dce8f3]">Recent chats</h3>
        <div className="mt-3 h-full max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="premium-surface h-16 animate-pulse rounded-lg dark:border-[#355269] dark:bg-[#1d3344]" />
              ))}
            </div>
          ) : recentChats.length === 0 ? (
            <div className="premium-surface rounded-lg border-dashed px-4 py-6 text-sm text-[#6b7280] dark:border-[#355269] dark:bg-[#1d3344] dark:text-[#a9c3d8]">
              No recent conversation found.
            </div>
          ) : (
            recentChats.map((chat, index) => (
              <Link
                key={`${chat.id || index}-recent`}
                to="/chat"
                className="premium-surface block rounded-lg px-4 py-3 transition hover:border-[#b9d8f2] hover:bg-moss-50 dark:border-[#355269] dark:bg-[#1d3344] dark:hover:border-[#4f7391] dark:hover:bg-[#26465d]"
              >
                <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.08em] text-[#6b7280] dark:text-[#a9c3d8]">
                  <Clock3 size={12} />
                  {chat.mode === 'compliance_review' ? 'Compliance review' : 'Chat'}
                </div>
                <p className="line-clamp-1 text-sm font-medium text-[#1a1a1a] dark:text-[#dce8f3]">{chat.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-[#6b7280] dark:text-[#a9c3d8]">{chat.previewQuestion}</p>
              </Link>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default DashboardPage;
