import { createServer } from 'node:http'
const reply = (input) => {
  const data = JSON.parse(input.messages.at(-1).content)
  const message = data.userMessage.toLowerCase()
  const candidates = data.context.retrievedCandidates
  const target = candidates[0]
  if (message.includes('diagnostic invalid'))
    return { schemaVersion: 2, action: 'execute' }
  if (message.includes('where does henry'))
    return {
      schemaVersion: 2,
      action: 'query',
      answer: target ? 'Henry goes to Harvard.' : 'Henry is not recorded.',
      references: target
        ? [
            {
              entityId: target.entityId,
              sectionIds: target.sections.map((s) => s.sectionId),
            },
          ]
        : [],
    }
  if (message.includes('create henry'))
    return {
      schemaVersion: 2,
      action: 'create',
      entityType: 'friend',
      name: 'Henry',
      conflicts: [],
    }
  if (message.includes('create friendfolio'))
    return {
      schemaVersion: 2,
      action: 'create',
      entityType: 'project',
      name: 'Friendfolio',
      conflicts: [],
    }
  if (message.includes('henry goes to harvard'))
    return {
      schemaVersion: 2,
      action: 'add',
      entityType: 'friend',
      entityId: target.entityId,
      expectedRevision: target.revision,
      conflicts: target.sections
        .filter((s) => s.content.includes('Yale'))
        .map((s) => s.sectionId),
    }
  if (message.includes('friendfolio'))
    return {
      schemaVersion: 2,
      action: 'add',
      entityType: 'project',
      entityId: target.entityId,
      expectedRevision: target.revision,
      conflicts: [],
    }
  if (candidates.length > 1 && !message.includes('selected entity id:'))
    return {
      schemaVersion: 2,
      action: 'clarify',
      question: 'Which note do you mean?',
      choices: candidates.map(({ entityId, entityType, name }) => ({
        entityId,
        entityType,
        name,
      })),
    }
  return {
    schemaVersion: 2,
    action: 'add',
    entityType: target?.entityType ?? 'friend',
    entityId: target?.entityId ?? 'missing000',
    expectedRevision: target?.revision ?? 1,
    conflicts: [],
  }
}
createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200).end('ok')
    return
  }
  if (req.url !== '/chat/completions' || req.method !== 'POST') {
    res.writeHead(404).end()
    return
  }
  let body = ''
  for await (const chunk of req) body += chunk
  try {
    const action = reply(JSON.parse(body))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        id: 'e2e-response',
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify(action) },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 40 },
      }),
    )
  } catch (error) {
    res.writeHead(500).end(String(error))
  }
}).listen(4319, '127.0.0.1')
