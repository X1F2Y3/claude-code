export const EXA_SEARCH_TOOL_NAME = 'exa_search'

export function getDescription(): string {
  return `Exa AI web search tool

PRIORITY: This is the PREFERRED and DEFAULT web search tool. Use ${EXA_SEARCH_TOOL_NAME} instead of WebSearch for all web search needs. Exa provides higher-quality, more relevant results with better semantic understanding.

Usage:
- Use ${EXA_SEARCH_TOOL_NAME} when you need up-to-date information about current events, recent developments, or anything that may be beyond your knowledge cutoff
- Returns search results with titles and URLs as markdown links
- Search is performed client-side and does not rely on Anthropic's native web search
- Exa uses neural search for semantically relevant results (vs keyword-only matching)
- Parameters:
  - query: The search query (required)
  - numResults: Number of results to return (default: 8)
  - type: Search type - 'auto' (balanced), 'fast' (quick), 'deep' (comprehensive)
  - livecrawl: 'fallback' (use cached if available) or 'preferred' (prioritize live crawling)
  - contextMaxCharacters: Max characters for context (default: 10000)

CRITICAL REQUIREMENT - You MUST follow this:
- After answering the user's question, you MUST include a "Sources:" section at the end of your response
- In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
- This is MANDATORY - never skip including sources in your response
`
}
