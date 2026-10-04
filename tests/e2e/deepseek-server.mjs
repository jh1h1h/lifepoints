import { createServer } from 'node:http'

const reply = (input) => {
  const data = JSON.parse(input.messages.at(-1).content)
  const message = data.userMessage.toLowerCase()
  const candidates = data.context.retrievedCandidates
  const target = candidates[0]
  const base = { schemaVersion: 1, reason: 'Suggested from the user message.' }
  if (message.includes('diagnostic invalid action')) {
    return { schemaVersion: 1, action: 'execute', command: 'unsupported' }
  }
  if (message.includes('where did kevin work previously')) {
    const eventIds = [
      ...(target.historicalDeltas ?? '').matchAll(
        /Event ID: ([A-Za-z0-9_-]+)/g,
      ),
    ].map((match) => match[1])
    return {
      schemaVersion: 1,
      action: 'query',
      answer: 'Kevin previously worked at Microsoft.',
      references: [
        {
          entityId: target.entityId,
          revision: target.revision,
          eventIds: eventIds.slice(0, 2),
        },
      ],
    }
  }
  if (message.includes('where does kevin work')) {
    return {
      schemaVersion: 1,
      action: 'query',
      answer: 'Kevin currently works at Apple.',
      references: [
        { entityId: target.entityId, revision: target.revision, eventIds: [] },
      ],
    }
  }
  if (message.includes('create kevin')) {
    return {
      ...base,
      action: 'create',
      entityType: 'friend',
      name: 'Kevin',
      content: '',
      changeType: 'new_information',
    }
  }
  if (message.includes('create friendfolio')) {
    return {
      ...base,
      action: 'create',
      entityType: 'project',
      name: 'Friendfolio',
      content: 'Goals:\nBuild Friendfolio',
      changeType: 'new_information',
    }
  }
  if (message.includes('microsoft')) {
    return {
      ...base,
      action: 'add',
      entityType: 'friend',
      entityId: target.entityId,
      expectedRevision: target.revision,
      scope: 'content',
      newText: 'Working at Microsoft',
      afterText: null,
      changeType: 'new_information',
    }
  }
  if (message.includes('apple')) {
    return {
      ...base,
      action: 'modify',
      entityType: 'friend',
      entityId: target.entityId,
      expectedRevision: target.revision,
      scope: 'content',
      oldText: 'Working at Microsoft',
      newText: 'Working at Apple',
      changeType: 'new_information',
    }
  }
  if (message.includes('remove hiking')) {
    return {
      ...base,
      action: 'delete',
      entityType: 'friend',
      entityId: target.entityId,
      expectedRevision: target.revision,
      scope: 'content',
      oldText: 'Hiking',
      changeType: 'unspecified',
    }
  }
  if (message.includes('friendfolio')) {
    return {
      ...base,
      action: 'add',
      entityType: 'project',
      entityId: target.entityId,
      expectedRevision: target.revision,
      scope: 'content',
      newText: 'Complete AI integration',
      afterText: null,
      changeType: 'new_information',
    }
  }
  if (message.includes('changed jobs')) {
    return {
      ...base,
      action: 'modify',
      entityType: 'friend',
      entityId: target.entityId,
      expectedRevision: target.revision,
      scope: 'content',
      oldText: 'Working at Apple',
      newText: 'Changed jobs; current employer unknown',
      changeType: 'new_information',
    }
  }
  return {
    schemaVersion: 1,
    action: 'clarify',
    question: 'Could you say which document you mean?',
    choices: [],
  }
}

createServer(async (request, response) => {
  if (request.url === '/health') {
    response.writeHead(200).end('ok')
    return
  }
  if (request.url !== '/chat/completions' || request.method !== 'POST') {
    response.writeHead(404).end()
    return
  }
  let body = ''
  for await (const chunk of request) body += chunk
  try {
    const action = reply(JSON.parse(body))
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify({
        id: 'e2e-response',
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify(action) },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 60 },
      }),
    )
  } catch (error) {
    response.writeHead(500).end(String(error))
  }
}).listen(4319, '127.0.0.1')
