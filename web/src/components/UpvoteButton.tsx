import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

interface UpvoteResponse {
  issueId: string;
  upvoteCount: number;
  userUpvoted: boolean;
  priorityScore: number;
  priorityTier: string;
}

interface Props {
  issueId: string;
  count: number;
  voted: boolean;
  big?: boolean;
  /** Called when the server confirms the new state (for feed/priority updates). */
  onConfirmed?: (result: UpvoteResponse) => void;
}

/**
 * One upvote per user per issue, enforced server-side. The button animates
 * immediately (optimistic) and the write is debounced so rapid taps stay
 * snappy without spamming the API.
 */
export function UpvoteButton({ issueId, count, voted, big, onConfirmed }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayCount, setDisplayCount] = useState(count);
  const [votedState, setVotedState] = useState(voted);
  const [animating, setAnimating] = useState(false);
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep in sync if the parent refetches.
  useEffect(() => {
    setDisplayCount(count);
    setVotedState(voted);
  }, [count, voted]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const fire = async (willVote: boolean) => {
    setPending(true);
    try {
      const res = willVote
        ? await api.post<UpvoteResponse>(`/api/issues/${issueId}/upvote`)
        : await api.del<UpvoteResponse>(`/api/issues/${issueId}/upvote`);
      // Use server truth (avoids drift from a debounce race).
      setDisplayCount(res.upvoteCount);
      setVotedState(res.userUpvoted);
      onConfirmed?.(res);
    } catch {
      // Roll back to the last server-confirmed state.
      setDisplayCount(count);
      setVotedState(voted);
    } finally {
      setPending(false);
    }
  };

  const toggle = () => {
    if (!user) {
      navigate("/auth", { state: { from: window.location.pathname } });
      return;
    }
    if (pending) return;
    const nextVote = !votedState;
    setVotedState(nextVote);
    setDisplayCount((c) => Math.max(0, c + (nextVote ? 1 : -1)));
    setAnimating(true);
    setTimeout(() => setAnimating(false), 500);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void fire(nextVote), 300);
  };

  return (
    <button
      className={`upvote-btn ${votedState ? "voted" : ""} ${animating ? "bounce" : ""} ${big ? "big" : ""}`}
      onClick={toggle}
      aria-pressed={votedState}
      title={votedState ? "Remove your upvote" : "Upvote this issue"}
    >
      <span className="thumb">{votedState ? "👍" : "👍🏻"}</span>
      <span className="count-up">{displayCount}</span>
    </button>
  );
}