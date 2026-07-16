// Session + event-log persistence. Everything else in lib/agent operates on the
// in-memory AgentEvent[] these helpers load; this is the only DB boundary for the log.

import type { QueryFn } from "../../db/mod.ts";
import type { AgentSession } from "../../db/types.ts";
import {
  type AgentEvent,
  type AgentEventBody,
  toAgentEvent,
} from "./events.ts";

export async function getSession(
  q: QueryFn,
  id: string,
): Promise<AgentSession | null> {
  const res = await q<AgentSession>(
    "SELECT * FROM agent_sessions WHERE id = $1",
    [id],
  );
  if (res.rows.length === 0) return null;
  const s = res.rows[0];
  return { ...s, head_seq: s.head_seq == null ? null : Number(s.head_seq) };
}

export async function listSessions(
  q: QueryFn,
  userId: string,
): Promise<AgentSession[]> {
  const res = await q<AgentSession>(
    "SELECT * FROM agent_sessions WHERE user_id = $1 ORDER BY updated_at DESC",
    [userId],
  );
  return res.rows;
}

export async function createSession(
  q: QueryFn,
  userId: string,
  householdId: string,
  title = "New chat",
): Promise<AgentSession> {
  const res = await q<AgentSession>(
    `INSERT INTO agent_sessions (user_id, household_id, title)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, householdId, title],
  );
  return res.rows[0];
}

export async function deleteSession(q: QueryFn, id: string): Promise<void> {
  await q("DELETE FROM agent_sessions WHERE id = $1", [id]);
}

export async function setSessionTitle(
  q: QueryFn,
  id: string,
  title: string,
): Promise<void> {
  await q(
    "UPDATE agent_sessions SET title = $1, updated_at = now() WHERE id = $2",
    [
      title,
      id,
    ],
  );
}

/** Rollback head. `seq` must be a turn boundary and after the last apply (checked by caller). */
export async function setHeadSeq(
  q: QueryFn,
  id: string,
  seq: number | null,
): Promise<void> {
  await q(
    "UPDATE agent_sessions SET head_seq = $1, updated_at = now() WHERE id = $2",
    [
      seq,
      id,
    ],
  );
}

/** Load the (head-filtered) event log in order. */
export async function loadEvents(
  q: QueryFn,
  sessionId: string,
  headSeq: number | null,
): Promise<AgentEvent[]> {
  const res = await q<{ seq: string; type: string; payload: unknown }>(
    headSeq == null
      ? "SELECT seq, type, payload FROM agent_events WHERE session_id = $1 ORDER BY seq"
      : "SELECT seq, type, payload FROM agent_events WHERE session_id = $1 AND seq <= $2 ORDER BY seq",
    headSeq == null ? [sessionId] : [sessionId, headSeq],
  );
  return res.rows.map((r) => toAgentEvent({ ...r, seq: Number(r.seq) }));
}

/** Seq of the most recent `apply` event, or null. Rollback may not cross it. */
export async function lastApplySeq(
  q: QueryFn,
  sessionId: string,
): Promise<number | null> {
  const res = await q<{ seq: string }>(
    "SELECT MAX(seq) AS seq FROM agent_events WHERE session_id = $1 AND type = 'apply'",
    [sessionId],
  );
  const v = res.rows[0]?.seq;
  return v == null ? null : Number(v);
}

/** Hard-delete every event after `seq` (a turn boundary, after the last apply). */
export async function rollbackTo(
  q: QueryFn,
  sessionId: string,
  seq: number,
): Promise<void> {
  await q("DELETE FROM agent_events WHERE session_id = $1 AND seq > $2", [
    sessionId,
    seq,
  ]);
  await q("UPDATE agent_sessions SET updated_at = now() WHERE id = $1", [
    sessionId,
  ]);
}

/** Append one event; returns its assigned seq. Also bumps the session's updated_at. */
export async function appendEvent(
  q: QueryFn,
  sessionId: string,
  body: AgentEventBody,
): Promise<number> {
  const res = await q<{ seq: string }>(
    `INSERT INTO agent_events (session_id, type, payload) VALUES ($1, $2, $3) RETURNING seq`,
    [sessionId, body.type, JSON.stringify(body.payload)],
  );
  await q("UPDATE agent_sessions SET updated_at = now() WHERE id = $1", [
    sessionId,
  ]);
  return Number(res.rows[0].seq);
}
