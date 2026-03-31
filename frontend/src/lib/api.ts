const BASE_URL = '/api'

export async function createSession(query: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`)
  const data = await res.json()
  return data.session_id
}

export async function sendAnswer(sessionId: string, answer: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/answer/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  if (!res.ok) throw new Error(`Failed to send answer: ${res.status}`)
}

export function getStreamUrl(sessionId: string): string {
  // Backend decides mock vs live based on MOCK_MODE env var
  return `${BASE_URL}/stream/${sessionId}`
}
