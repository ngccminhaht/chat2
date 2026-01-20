'use client';

import { useState } from 'react';
import { Highlight, themes } from 'prism-react-renderer';
import { Box, IconButton, Tooltip, useTheme } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';

interface CodeBlockProps {
  code: string;
  language: 'bash' | 'json' | 'typescript' | 'javascript';
}

export default function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const muiTheme = useTheme();
  const isDark = muiTheme.palette.mode === 'dark';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box sx={{ position: 'relative' }}>
      <Tooltip title={copied ? 'Copied!' : 'Copy'}>
        <IconButton
          onClick={handleCopy}
          size="small"
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            color: isDark ? 'grey.400' : 'grey.600',
            bgcolor: isDark ? 'grey.800' : 'grey.200',
            '&:hover': { bgcolor: isDark ? 'grey.700' : 'grey.300' },
          }}
        >
          {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Highlight theme={isDark ? themes.nightOwl : themes.github} code={code.trim()} language={language}>
        {({ style, tokens, getLineProps, getTokenProps }) => (
          <Box
            component="pre"
            sx={{
              ...style,
              p: 2,
              pr: 6,
              borderRadius: 1,
              overflow: 'auto',
              fontSize: '0.875rem',
              lineHeight: 1.6,
              m: 0,
            }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </Box>
        )}
      </Highlight>
    </Box>
  );
}
