import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import React from 'react';
import { CtrlOToExpand } from 'src/components/CtrlOToExpand.js';
import { FallbackToolUseErrorMessage } from 'src/components/FallbackToolUseErrorMessage.js';
import { MessageResponse } from 'src/components/MessageResponse.js';
import { TOOL_SUMMARY_MAX_LENGTH } from 'src/constants/toolLimits.js';
import { Box, Text } from '@anthropic/ink';
import type { ToolProgressData } from 'src/types/tools.js';
import type { ProgressMessage } from 'src/types/message.js';
import { truncate } from 'src/utils/format.js';

export interface SearchResult {
  title: string;
  url: string;
}

export interface Output {
  query: string;
  results: SearchResult[];
  durationSeconds: number;
}

function SearchResultSummary({
  count,
  countLabel,
  content,
  verbose,
}: {
  count: number;
  countLabel: string;
  content?: string;
  verbose: boolean;
}): React.ReactNode {
  const primaryText = (
    <Text>
      Found <Text bold>{count} </Text>
      {count === 1 ? countLabel.slice(0, -1) : countLabel}
    </Text>
  );

  if (verbose) {
    return (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text dimColor> ⎿ </Text>
          {primaryText}
        </Box>
        {content && (
          <Box marginLeft={5}>
            <Text>{content}</Text>
          </Box>
        )}
      </Box>
    );
  }

  return (
    <MessageResponse height={1}>
      {primaryText}
      {count > 0 && <CtrlOToExpand />}
    </MessageResponse>
  );
}

export function renderToolUseMessage(
  { query }: Partial<{ query: string }>,
  { verbose }: { verbose: boolean },
): React.ReactNode {
  if (!query) {
    return null;
  }
  return `Searching: "${query}"`;
}

export function renderToolUseErrorMessage(
  result: ToolResultBlockParam['content'],
  { verbose }: { verbose: boolean },
): React.ReactNode {
  if (!verbose && typeof result === 'string') {
    return (
      <MessageResponse>
        <Text color="error">Search failed</Text>
      </MessageResponse>
    );
  }
  return <FallbackToolUseErrorMessage result={result} verbose={verbose} />;
}

export function renderToolResultMessage(
  output: Output,
  _progressMessagesForMessage: ProgressMessage<ToolProgressData>[],
  { verbose }: { verbose: boolean },
): React.ReactNode {
  const resultCount = output.results?.length ?? 0;

  const content = output.results?.length > 0 ? output.results.map(r => `${r.title}\n  ${r.url}`).join('\n') : undefined;

  return <SearchResultSummary count={resultCount} countLabel="results" content={content} verbose={verbose} />;
}

export function getToolUseSummary(
  input:
    | Partial<{
        query: string;
        numResults?: number;
        type?: 'auto' | 'fast' | 'deep';
        livecrawl?: 'fallback' | 'preferred';
        contextMaxCharacters?: number;
      }>
    | undefined,
): string | null {
  if (!input?.query) {
    return null;
  }
  return truncate(input.query, TOOL_SUMMARY_MAX_LENGTH);
}
