"use client";

import { useRef, useEffect, useCallback } from "react";
import {
  Box,
  Paper,
  Typography,
  Avatar,
  Stack,
  Link,
  CircularProgress,
} from "@mui/material";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import ScheduleIcon from "@mui/icons-material/Schedule";
import CheckIcon from "@mui/icons-material/Check";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { format } from "date-fns";
import { Message, MessageContent } from "../types/conversation.types";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import EmptyState from "@/components/common/EmptyState";

// Helper to extract media URL from various formats (Zalo uses attachments array)
function getMediaUrl(content: MessageContent): string | undefined {
  // Direct mediaUrl (outbound messages, normalized format)
  if (content.mediaUrl) return content.mediaUrl;
  if (content.url) return content.url;

  // Zalo inbound format: attachments[].payload.url or attachments[].payload.thumbnail
  if (
    content.attachments &&
    Array.isArray(content.attachments) &&
    content.attachments.length > 0
  ) {
    const attachment = content.attachments[0];
    if (attachment?.payload?.url) return attachment.payload.url;
    if (attachment?.payload?.thumbnail) return attachment.payload.thumbnail;
  }

  return undefined;
}

// Helper to check if text is just a media link pattern (e.g., [image: ...], [Image: ...])
function isMediaLinkPattern(text: string | undefined): boolean {
  if (!text) return false;
  const pattern =
    /^\[(image|Image|video|Video|audio|Audio|file|File):\s*https?:\/\/.+\]$/i;
  return pattern.test(text.trim());
}

// Helper to get file name
function getFileName(content: MessageContent): string | undefined {
  if (content.fileName) return content.fileName;

  if (
    content.attachments &&
    Array.isArray(content.attachments) &&
    content.attachments.length > 0
  ) {
    const attachment = content.attachments[0];
    if (attachment?.payload?.name) return attachment.payload.name;
  }

  return undefined;
}

// Helper to get file size
function getFileSize(content: MessageContent): number | undefined {
  if (content.fileSize) return content.fileSize;

  if (
    content.attachments &&
    Array.isArray(content.attachments) &&
    content.attachments.length > 0
  ) {
    const attachment = content.attachments[0];
    if (attachment?.payload?.size) return attachment.payload.size;
  }

  return undefined;
}

// Format file size
function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Get status icon for outbound messages
function getStatusIcon(status: string, isOutbound: boolean) {
  if (!isOutbound) return null;

  const iconStyle = { fontSize: 14, ml: 0.5, verticalAlign: "middle" };

  switch (status) {
    case "pending":
      return <ScheduleIcon sx={iconStyle} />;
    case "sent":
      return <CheckIcon sx={iconStyle} />;
    case "delivered":
      return <DoneAllIcon sx={iconStyle} />;
    case "read":
      return <DoneAllIcon sx={{ ...iconStyle, color: "info.light" }} />;
    case "failed":
      return <ErrorOutlineIcon sx={{ ...iconStyle, color: "error.light" }} />;
    default:
      return null;
  }
}

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
  isFetchingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export default function MessageList({
  messages,
  isLoading,
  isFetchingMore,
  hasMore,
  onLoadMore,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef<number>(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Scroll to bottom on initial load and new messages
  useEffect(() => {
    if (!isFetchingMore) {
      scrollToBottom();
    }
  }, [messages.length, isFetchingMore]);

  // Preserve scroll position after loading older messages
  useEffect(() => {
    if (containerRef.current && prevScrollHeight.current > 0) {
      const newScrollHeight = containerRef.current.scrollHeight;
      containerRef.current.scrollTop =
        newScrollHeight - prevScrollHeight.current;
      prevScrollHeight.current = 0;
    }
  }, [messages]);

  // Handle scroll to detect when user scrolls to top
  const handleScroll = useCallback(() => {
    if (!containerRef.current || !onLoadMore || !hasMore || isFetchingMore)
      return;

    const { scrollTop } = containerRef.current;
    // Load more when scrolled near top (within 100px)
    if (scrollTop < 100) {
      prevScrollHeight.current = containerRef.current.scrollHeight;
      onLoadMore();
    }
  }, [onLoadMore, hasMore, isFetchingMore]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (messages.length === 0) {
    return <EmptyState message="No messages yet" />;
  }

  return (
    <Box
      ref={containerRef}
      onScroll={handleScroll}
      sx={{
        height: "100%",
        overflowY: "auto",
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {/* Loading indicator for older messages */}
      {isFetchingMore && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
          <CircularProgress size={24} />
        </Box>
      )}
      {messages.map((message) => {
        const isOutbound = message.direction === "outbound";

        return (
          <Stack
            key={message._id}
            direction="row"
            spacing={1}
            sx={{
              justifyContent: isOutbound ? "flex-end" : "flex-start",
            }}
          >
            {!isOutbound && (
              <Avatar
                src={message.sender.avatar}
                alt={message.sender.name}
                sx={{ width: 32, height: 32 }}
              >
                {message.sender.name.charAt(0)}
              </Avatar>
            )}

            <Box
              sx={{
                maxWidth: "70%",
                minWidth: 0, // Allow flexbox to shrink below content size
                overflow: "hidden", // Prevent content from overflowing
              }}
            >
              {!isOutbound && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  {message.sender.name}
                </Typography>
              )}

              <Paper
                sx={{
                  p: 1.5,
                  bgcolor: isOutbound ? "primary.main" : "background.paper",
                  color: isOutbound ? "primary.contrastText" : "text.primary",
                  maxWidth: "100%",
                  overflow: "hidden", // Prevent content from overflowing
                  wordWrap: "break-word",
                  wordBreak: "break-all", // Break at any character when needed (even without spaces)
                }}
              >
                {message.type === "text" && (
                  <Typography
                    variant="body1"
                    sx={{
                      wordWrap: "break-word",
                      wordBreak: "break-all", // Break at any character when needed (even without spaces)
                      whiteSpace: "pre-wrap",
                      overflow: "hidden",
                      maxWidth: "100%",
                    }}
                  >
                    {message.content.text}
                  </Typography>
                )}
                {message.type === "image" && (
                  <Box>
                    {getMediaUrl(message.content) ? (
                      <img
                        src={getMediaUrl(message.content)}
                        alt="Message attachment"
                        style={{
                          maxWidth: "100%",
                          maxHeight: 300,
                          borderRadius: 4,
                          objectFit: "contain",
                        }}
                      />
                    ) : (
                      <Typography variant="body2">[Image]</Typography>
                    )}
                    {message.content.text &&
                      !isMediaLinkPattern(message.content.text) && (
                        <Typography
                          variant="body1"
                          sx={{
                            mt: 1,
                            wordWrap: "break-word",
                            wordBreak: "break-all", // Break at any character when needed (even without spaces)
                            whiteSpace: "pre-wrap",
                            overflow: "hidden",
                            maxWidth: "100%",
                          }}
                        >
                          {message.content.text}
                        </Typography>
                      )}
                  </Box>
                )}
                {message.type === "file" && (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <InsertDriveFileIcon />
                    <Box>
                      {getMediaUrl(message.content) ? (
                        <Link
                          href={getMediaUrl(message.content)}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{
                            color: isOutbound ? "inherit" : "primary.main",
                          }}
                        >
                          {getFileName(message.content) || "Download file"}
                        </Link>
                      ) : (
                        <Typography variant="body2">
                          {getFileName(message.content) || "File attachment"}
                        </Typography>
                      )}
                      {getFileSize(message.content) && (
                        <Typography
                          variant="caption"
                          sx={{ display: "block", opacity: 0.7 }}
                        >
                          {formatFileSize(getFileSize(message.content))}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}
                {message.type === "video" && (
                  <Box>
                    {getMediaUrl(message.content) ? (
                      <video
                        src={getMediaUrl(message.content)}
                        controls
                        style={{
                          maxWidth: "100%",
                          maxHeight: 300,
                          borderRadius: 4,
                        }}
                      />
                    ) : (
                      <Typography variant="body2">[Video]</Typography>
                    )}
                  </Box>
                )}
                {message.type === "audio" && (
                  <Box>
                    {getMediaUrl(message.content) ? (
                      <audio
                        src={getMediaUrl(message.content)}
                        controls
                        style={{ width: "100%" }}
                      />
                    ) : (
                      <Typography variant="body2">[Audio]</Typography>
                    )}
                  </Box>
                )}
                {message.type === "sticker" && (
                  <Box>
                    {getMediaUrl(message.content) ? (
                      <img
                        src={getMediaUrl(message.content)}
                        alt="Sticker"
                        style={{ maxWidth: 150, maxHeight: 150 }}
                      />
                    ) : (
                      <Typography variant="body2">[Sticker]</Typography>
                    )}
                  </Box>
                )}
                {message.type === "location" && (
                  <Typography
                    variant="body2"
                    sx={{
                      wordWrap: "break-word",
                      wordBreak: "break-all", // Break at any character when needed
                    }}
                  >
                    {message.content.text || "[Location]"}
                  </Typography>
                )}

                <Typography
                  variant="caption"
                  component="span"
                  color={isOutbound ? "primary.contrastText" : "text.secondary"}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    mt: 0.5,
                    opacity: 0.7,
                  }}
                >
                  {format(new Date(message.createdAt), "HH:mm")}
                  {getStatusIcon(message.status, isOutbound)}
                </Typography>
              </Paper>
            </Box>

            {isOutbound && (
              <Avatar sx={{ width: 32, height: 32, bgcolor: "primary.main" }}>
                A
              </Avatar>
            )}
          </Stack>
        );
      })}
      <div ref={messagesEndRef} />
    </Box>
  );
}
