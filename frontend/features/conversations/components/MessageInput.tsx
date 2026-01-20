'use client';

import { useState, useRef, ChangeEvent, useEffect } from 'react';
import {
  Box,
  TextField,
  IconButton,
  CircularProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ImageIcon from '@mui/icons-material/Image';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloseIcon from '@mui/icons-material/Close';
import { useSendMessage } from '../hooks/useSendMessage';
import { useUploadMedia } from '../hooks/useUploadMedia';
import { QuickReplyPicker } from '@/features/quick-replies';

interface MessageInputProps {
  conversationId: string;
}

interface FilePreview {
  file: File;
  previewUrl?: string;
  type: 'image' | 'file';
}

export default function MessageInput({ conversationId }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [quickReplySearch, setQuickReplySearch] = useState('');
  const { mutate: sendMessage, isPending: isSending } = useSendMessage();
  const { mutateAsync: uploadMedia, isPending: isUploading } = useUploadMedia();
  const isSendingRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isPending = isSending || isUploading;

  // Detect "/" trigger for quick replies
  useEffect(() => {
    if (message.startsWith('/')) {
      setShowQuickReplies(true);
      setQuickReplySearch(message.slice(1)); // Text after "/"
    } else {
      setShowQuickReplies(false);
      setQuickReplySearch('');
    }
  }, [message]);

  // Handle quick reply selection
  const handleQuickReplySelect = (content: string) => {
    setMessage(content);
    setShowQuickReplies(false);
  };

  const handleSend = async () => {
    if (isPending || isSendingRef.current) return;

    // Handle file/image send
    if (filePreview) {
      isSendingRef.current = true;
      try {
        // Upload file to MinIO
        const uploadResult = await uploadMedia(filePreview.file);

        // Send message with uploaded file URL
        sendMessage(
          {
            conversationId,
            type: filePreview.type,
            content: {
              url: uploadResult.url,
              mediaUrl: uploadResult.url,
              mediaType: uploadResult.contentType,
              fileName: filePreview.file.name,
              fileSize: uploadResult.size,
            },
          },
          {
            onSuccess: () => {
              isSendingRef.current = false;
              setFilePreview(null);
              setMessage('');
              // Focus input after sending
              setTimeout(() => inputRef.current?.focus(), 0);
            },
            onError: () => {
              isSendingRef.current = false;
            },
          }
        );
      } catch {
        isSendingRef.current = false;
      }
      return;
    }

    // Handle text send
    if (!message.trim()) return;

    isSendingRef.current = true;
    const messageToSend = message.trim();
    setMessage('');

    sendMessage(
      {
        conversationId,
        type: 'text',
        content: { text: messageToSend },
      },
      {
        onSuccess: () => {
          isSendingRef.current = false;
          // Focus input after sending
          setTimeout(() => inputRef.current?.focus(), 0);
        },
        onError: () => {
          isSendingRef.current = false;
          setMessage(messageToSend);
        },
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAttachClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleImageSelect = () => {
    handleMenuClose();
    imageInputRef.current?.click();
  };

  const handleFileSelect = () => {
    handleMenuClose();
    fileInputRef.current?.click();
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setFilePreview({ file, previewUrl, type: 'image' });
    }
    e.target.value = '';
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFilePreview({ file, type: 'file' });
    }
    e.target.value = '';
  };

  const handleClearPreview = () => {
    if (filePreview?.previewUrl) {
      URL.revokeObjectURL(filePreview.previewUrl);
    }
    setFilePreview(null);
  };

  return (
    <Box sx={{ borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      {/* File Preview */}
      {filePreview && (
        <Box sx={{ p: 2, pb: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
          {filePreview.type === 'image' && filePreview.previewUrl ? (
            <Box
              component="img"
              src={filePreview.previewUrl}
              alt="Preview"
              sx={{ height: 80, maxWidth: 200, objectFit: 'contain', borderRadius: 1 }}
            />
          ) : (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1,
                bgcolor: 'action.hover',
                borderRadius: 1,
              }}
            >
              <InsertDriveFileIcon color="primary" />
              <Box sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {filePreview.file.name}
              </Box>
            </Box>
          )}
          <IconButton size="small" onClick={handleClearPreview}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {/* Input Area */}
      <Box sx={{ p: 2, display: 'flex', gap: 1, alignItems: 'flex-end' }}>
        <IconButton onClick={handleAttachClick} disabled={isPending}>
          <AttachFileIcon />
        </IconButton>

        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
          <MenuItem onClick={handleImageSelect}>
            <ListItemIcon>
              <ImageIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Image</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleFileSelect}>
            <ListItemIcon>
              <InsertDriveFileIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>File</ListItemText>
          </MenuItem>
        </Menu>

        <Box sx={{ flexGrow: 1, position: 'relative' }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            placeholder={filePreview ? 'Press send to upload...' : 'Type / for quick replies...'}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending || !!filePreview}
            size="small"
            ref={textFieldRef}
            inputRef={inputRef}
          />
          <QuickReplyPicker
            anchorEl={textFieldRef.current}
            open={showQuickReplies}
            searchText={quickReplySearch}
            onSelect={handleQuickReplySelect}
            onClose={() => setShowQuickReplies(false)}
          />
        </Box>

        <IconButton
          color="primary"
          onClick={handleSend}
          disabled={(!message.trim() && !filePreview) || isPending}
          size="large"
        >
          {isPending ? <CircularProgress size={24} /> : <SendIcon />}
        </IconButton>
      </Box>

      {/* Hidden file inputs */}
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleImageChange}
        accept="image/*"
        style={{ display: 'none' }}
      />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,.rar"
        style={{ display: 'none' }}
      />
    </Box>
  );
}
