import { z } from 'zod/v4'
import type { ValidationResult } from 'src/Tool.js'
import { buildTool, type ToolDef } from 'src/Tool.js'
import { lazySchema } from 'src/utils/lazySchema.js'
import { EXA_SEARCH_TOOL_NAME, getDescription } from './prompt.js'
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
} from './UI.js'

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z.string().min(2).describe('The search query to use'),
    numResults: z
      .number()
      .optional()
      .describe('Number of search results to return (default: 8)'),
    livecrawl: z
      .enum(['fallback', 'preferred'])
      .optional()
      .describe(
        "Live crawl mode - 'fallback': use live crawling as backup if cached content unavailable, 'preferred': prioritize live crawling (default: 'fallback')",
      ),
    type: z
      .enum(['auto', 'fast', 'deep'])
      .optional()
      .describe(
        "Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search",
      ),
    contextMaxCharacters: z
      .number()
      .optional()
      .describe(
        'Maximum characters for context string optimized for LLMs (default: 10000)',
      ),
  }),
)

type InputSchema = ReturnType<typeof inputSchema>
type Input = z.infer<InputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    query: z.string().describe('The search query that was executed'),
    results: z
      .array(
        z.object({
          title: z.string().describe('The title of the search result'),
          url: z.string().describe('The URL of the search result'),
        }),
      )
      .describe('Search results'),
    durationSeconds: z
      .number()
      .describe('Time taken to complete the search operation'),
  }),
)

type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

const API_CONFIG = {
  BASE_URL: 'https://mcp.exa.ai',
  ENDPOINTS: {
    SEARCH: '/mcp',
  },
  DEFAULT_NUM_RESULTS: 8,
  TIMEOUT_MS: 25000,
} as const

interface McpSearchRequest {
  jsonrpc: string
  id: number
  method: string
  params: {
    name: string
    arguments: {
      query: string
      numResults?: number
      livecrawl?: 'fallback' | 'preferred'
      type?: 'auto' | 'fast' | 'deep'
      contextMaxCharacters?: number
    }
  }
}

interface McpSearchResponse {
  jsonrpc: string
  result: {
    content: Array<{
      type: string
      text: string
    }>
  }
}

function parseExaResults(text: string): Array<{ title: string; url: string }> {
  const results: Array<{ title: string; url: string }> = []
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  let match

  while ((match = linkRegex.exec(text)) !== null && results.length < 20) {
    const title = match[1].trim()
    const url = match[2].trim()

    if (
      title &&
      url &&
      (url.startsWith('http://') || url.startsWith('https://'))
    ) {
      results.push({ title, url })
    }
  }

  if (results.length === 0) {
    const lines = text.split('\n').filter(l => l.trim())
    for (const line of lines) {
      const urlMatch = line.match(/https?:\/\/[^\s]+/)
      if (urlMatch) {
        const url = urlMatch[0]
        const title =
          line
            .replace(url, '')
            .replace(/^[-*•]\s*/, '')
            .trim() || url
        results.push({ title, url })
      }
    }
  }

  return results
}

export const ExaSearchTool = buildTool({
  name: EXA_SEARCH_TOOL_NAME,
  searchHint: 'search the web using Exa AI for current information',
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  async description(input) {
    return `Exa web search for: ${input.query}`
  },
  userFacingName() {
    return 'Exa Search'
  },
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input)
    return summary ? `Searching the web for "${summary}"` : 'Searching the web'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.query
  },
  isSearchOrReadCommand() {
    return { isSearch: true, isRead: false }
  },
  async validateInput(input): Promise<ValidationResult> {
    if (!input.query || input.query.length < 2) {
      return {
        result: false,
        message: 'Query must be at least 2 characters',
        errorCode: 1,
      }
    }
    return { result: true }
  },
  async prompt() {
    return getDescription()
  },
  renderToolUseMessage,
  renderToolResultMessage,
  extractSearchText({ query, results }) {
    if (!results) return ''
    return results.map(r => `${r.title} ${r.url}`).join('\n')
  },
  async call(input, { abortController }): Promise<{ data: Output }> {
    const startTime = performance.now()

    const searchRequest: McpSearchRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'web_search_exa',
        arguments: {
          query: input.query,
          type: input.type || 'auto',
          numResults: input.numResults || API_CONFIG.DEFAULT_NUM_RESULTS,
          livecrawl: input.livecrawl || 'fallback',
          contextMaxCharacters: input.contextMaxCharacters,
        },
      },
    }

    const timeoutId = setTimeout(
      () => abortController.abort(),
      API_CONFIG.TIMEOUT_MS,
    )

    try {
      const headers: Record<string, string> = {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      }

      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SEARCH}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(searchRequest),
          signal: abortController.signal,
        },
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Search error (${response.status}): ${errorText}`)
      }

      const responseText = await response.text()
      const lines = responseText.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data: McpSearchResponse = JSON.parse(line.substring(6))
          if (
            data.result &&
            data.result.content &&
            data.result.content.length > 0
          ) {
            const contentText = data.result.content[0].text
            const results = parseExaResults(contentText)

            return {
              data: {
                query: input.query,
                results,
                durationSeconds: (performance.now() - startTime) / 1000,
              },
            }
          }
        }
      }

      return {
        data: {
          query: input.query,
          results: [],
          durationSeconds: (performance.now() - startTime) / 1000,
        },
      }
    } finally {
      clearTimeout(timeoutId)
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    let formattedOutput = `Exa web search results for: "${output.query}"\n\n`

    if (output.results.length > 0) {
      output.results.forEach(r => {
        formattedOutput += `- ${r.title}\n  ${r.url}\n`
      })
    } else {
      formattedOutput += 'No results found.\n'
    }

    formattedOutput += `\nSearch completed in ${output.durationSeconds.toFixed(2)}s`

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: formattedOutput.trim(),
    }
  },
} satisfies ToolDef<InputSchema, Output, unknown>)
