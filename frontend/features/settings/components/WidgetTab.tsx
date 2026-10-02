'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  FormControlLabel,
  Switch,
  Paper,
  Divider,
  Tabs,
  Tab,
  Select,
  MenuItem,
  InputAdornment,
  IconButton,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Check as CheckIcon,
  Chat as ChatIcon,
  Message as MessageIcon,
  Forum as MessengerIcon,
  Image as ImageIcon,
  TouchApp as TouchAppIcon,
  OpenWith as OpenWithIcon,
  Palette as PaletteIcon,
  Person as PersonIcon,
  Height as HeightIcon,
  Translate as TranslateIcon,
  AutoAwesome as AutoAwesomeIcon,
  OpenInBrowser as OpenInBrowserIcon,
  Notifications as NotificationsIcon,
  Language as LanguageIcon,
  QuestionAnswer as QuestionAnswerIcon,
  Star as StarIcon,
  DragIndicator as DragIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useWidgetConfig, useUpdateWidgetConfig, UpdateWidgetConfigDto } from '../hooks/useWidgetConfig';
import WidgetPreview from './WidgetPreview';

// Color palette matching Pancake design
const COLOR_PALETTE = [
  '#3B82F6', // Blue (primary)
  '#2563EB', // Blue darker
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#22C55E', // Green
  '#14B8A6', // Teal
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
];

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

// Section component with icon and title
interface SectionProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}

function Section({ icon, title, description, children }: SectionProps) {
  return (
    <Box sx={{ mb: 4 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
        <Box sx={{ color: 'text.secondary' }}>{icon}</Box>
        <Typography variant="subtitle1" fontWeight={500}>{title}</Typography>
      </Stack>
      {description && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {description}
        </Typography>
      )}
      {children}
    </Box>
  );
}

// Button style preview component
interface StylePreviewProps {
  style: 'circle' | 'pill' | 'square';
  selected: boolean;
  onClick: () => void;
  color: string;
}

function StylePreview({ style, selected, onClick, color }: StylePreviewProps) {
  const getShape = () => {
    switch (style) {
      case 'circle':
        return { width: 48, height: 48, borderRadius: '50%' };
      case 'pill':
        return { width: 72, height: 40, borderRadius: 20 };
      case 'square':
        return { width: 48, height: 48, borderRadius: 1 };
    }
  };

  return (
    <Box
      onClick={onClick}
      sx={{
        p: 2,
        border: '2px solid',
        borderColor: selected ? 'primary.main' : 'grey.200',
        borderRadius: 2,
        cursor: 'pointer',
        bgcolor: selected ? 'primary.50' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s',
        '&:hover': {
          borderColor: selected ? 'primary.main' : 'grey.400',
        },
      }}
    >
      <Box sx={{ ...getShape(), bgcolor: color }} />
    </Box>
  );
}

// Position preview component
interface PositionPreviewProps {
  position: 'left' | 'right';
  selected: boolean;
  onClick: () => void;
}

function PositionPreview({ position, selected, onClick }: PositionPreviewProps) {
  return (
    <Box
      onClick={onClick}
      sx={{
        p: 1.5,
        border: '2px solid',
        borderColor: selected ? 'primary.main' : 'grey.200',
        borderRadius: 1,
        cursor: 'pointer',
        bgcolor: selected ? 'primary.50' : 'transparent',
        transition: 'all 0.2s',
        '&:hover': {
          borderColor: selected ? 'primary.main' : 'grey.400',
        },
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 40,
          bgcolor: 'grey.100',
          borderRadius: 0.5,
          position: 'relative',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 0.5,
          p: 0.5,
          justifyContent: position === 'right' ? 'flex-end' : 'flex-start',
          alignItems: 'flex-end',
        }}
      >
        <Box sx={{ width: 8, height: 8, bgcolor: 'primary.main', borderRadius: '50%' }} />
      </Box>
    </Box>
  );
}

// Icon button preview
interface IconPreviewProps {
  icon: 'chat' | 'message' | 'messenger' | 'custom';
  selected: boolean;
  onClick: () => void;
}

function IconPreview({ icon, selected, onClick }: IconPreviewProps) {
  const getIcon = () => {
    switch (icon) {
      case 'chat': return <ChatIcon />;
      case 'message': return <MessageIcon />;
      case 'messenger': return <MessengerIcon />;
      case 'custom': return <ImageIcon />;
    }
  };

  return (
    <Box
      onClick={onClick}
      sx={{
        p: 2,
        border: '2px solid',
        borderColor: selected ? 'primary.main' : 'grey.200',
        borderRadius: 2,
        cursor: 'pointer',
        bgcolor: selected ? 'primary.50' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s',
        '&:hover': {
          borderColor: selected ? 'primary.main' : 'grey.400',
        },
      }}
    >
      <Box sx={{ color: selected ? 'primary.main' : 'text.secondary' }}>
        {getIcon()}
      </Box>
      {icon === 'custom' && (
        <Typography variant="caption" sx={{ ml: 0.5, color: 'text.secondary' }}>
          Tải ảnh
        </Typography>
      )}
    </Box>
  );
}

// Color swatch component
interface ColorSwatchProps {
  color: string;
  selected: boolean;
  onClick: () => void;
  showPicker?: boolean;
}

function ColorSwatch({ color, selected, onClick, showPicker }: ColorSwatchProps) {
  return (
    <Box
      onClick={onClick}
      sx={{
        width: 32,
        height: 32,
        bgcolor: color,
        borderRadius: '50%',
        cursor: 'pointer',
        border: '3px solid',
        borderColor: selected ? 'primary.main' : 'transparent',
        outline: selected ? '2px solid white' : 'none',
        outlineOffset: -3,
        transition: 'all 0.15s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '&:hover': {
          transform: 'scale(1.1)',
        },
      }}
    >
      {selected && <CheckIcon sx={{ color: 'white', fontSize: 16 }} />}
      {showPicker && <PaletteIcon sx={{ color: 'grey.500', fontSize: 16 }} />}
    </Box>
  );
}

// Pre-chat field row
interface FieldRowProps {
  field: string;
  label: string;
  placeholder: string;
  enabled: boolean;
  onToggle: () => void;
}

function FieldRow({ field, label, placeholder, enabled, onToggle }: FieldRowProps) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={2}
      sx={{
        py: 1.5,
        borderBottom: '1px solid',
        borderColor: 'grey.100',
      }}
    >
      <DragIcon sx={{ color: 'grey.400', cursor: 'grab' }} />
      <Switch
        checked={enabled}
        onChange={onToggle}
        color="primary"
        size="small"
      />
      <Typography variant="body2" sx={{ minWidth: 100 }}>{label}</Typography>
      <TextField
        size="small"
        placeholder={placeholder}
        disabled={!enabled}
        fullWidth
        sx={{
          '& .MuiOutlinedInput-root': {
            bgcolor: enabled ? 'white' : 'grey.50',
          },
        }}
      />
    </Stack>
  );
}

export default function WidgetTab() {
  const { data: config, isLoading, error } = useWidgetConfig();
  const updateConfig = useUpdateWidgetConfig();

  const [form, setForm] = useState<UpdateWidgetConfigDto>({});
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Sync form with fetched config
  useEffect(() => {
    if (config) {
      setForm({
        buttonStyle: config.buttonStyle,
        buttonSize: config.buttonSize,
        buttonIcon: config.buttonIcon,
        customIconUrl: config.customIconUrl,
        position: config.position,
        marginRight: config.marginRight,
        marginBottom: config.marginBottom,
        marginBottomMobile: config.marginBottomMobile,
        primaryColor: config.primaryColor,
        textColor: config.textColor,
        avatarName: config.avatarName,
        avatarUrl: config.avatarUrl,
        windowHeightMobile: config.windowHeightMobile,
        windowHeight: config.windowHeight,
        windowHeightUnit: config.windowHeightUnit,
        greeting: config.greeting,
        offlineMessage: config.offlineMessage,
        preChatForm: config.preChatForm,
        preChatFields: config.preChatFields,
        logo: config.logo,
      });
    }
  }, [config]);

  const handleSave = () => {
    // Clean form data - remove empty strings for URL fields
    const cleanedForm = { ...form };
    if (cleanedForm.customIconUrl === '') delete cleanedForm.customIconUrl;
    if (cleanedForm.avatarUrl === '') delete cleanedForm.avatarUrl;
    if (cleanedForm.logo === '') delete cleanedForm.logo;

    console.log('Saving widget config:', cleanedForm);

    updateConfig.mutate(cleanedForm, {
      onSuccess: (data) => {
        console.log('Save success:', data);
        setPreviewKey((k) => k + 1);
      },
      onError: (error) => {
        console.error('Save error:', error);
      },
    });
  };

  const handleFieldToggle = (field: string) => {
    const currentFields = form.preChatFields || [];
    if (currentFields.includes(field)) {
      setForm({ ...form, preChatFields: currentFields.filter((f) => f !== field) });
    } else {
      setForm({ ...form, preChatFields: [...currentFields, field] });
    }
  };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8300/api';
  const embedCode = config
    ? `<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget.js" data-org="${config.organizationSlug}" data-api="${apiUrl}"></script>`
    : '';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">Failed to load widget configuration</Alert>;
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Paper variant="outlined" sx={{ width: '100%', border: 'none', boxShadow: 'none', bgcolor: 'transparent' }}>
        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)}>
            <Tab label="Hiển thị" />
            <Tab label="Biểu mẫu" />
            <Tab label="Chức năng" />
            <Tab label="Plugin code" />
          </Tabs>
        </Box>

        {/* Tab 1: Hiển thị (Display) */}
        <TabPanel value={activeTab} index={0}>
          <Box sx={{ px: 3 }}>
            {/* Button Style */}
            <Section icon={<TouchAppIcon />} title="Kiểu hiển thị nút">
              <Stack direction="row" spacing={2}>
                {(['circle', 'pill', 'square'] as const).map((style) => (
                  <StylePreview
                    key={style}
                    style={style}
                    selected={form.buttonStyle === style}
                    onClick={() => setForm({ ...form, buttonStyle: style })}
                    color={form.primaryColor || '#3B82F6'}
                  />
                ))}
              </Stack>
            </Section>

            <Divider sx={{ my: 3 }} />

            {/* Position & Size */}
            <Section icon={<OpenWithIcon />} title="Kích thước và vị trí nút">
              <Stack spacing={3}>
                {/* Position */}
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Vị trí
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <PositionPreview
                      position="left"
                      selected={form.position === 'left'}
                      onClick={() => setForm({ ...form, position: 'left' })}
                    />
                    <PositionPreview
                      position="right"
                      selected={form.position === 'right'}
                      onClick={() => setForm({ ...form, position: 'right' })}
                    />
                  </Stack>
                </Box>

                {/* Size inputs */}
                <Stack direction="row" spacing={2}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Kích thước nút chat
                    </Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={form.buttonSize || 60}
                      onChange={(e) => setForm({ ...form, buttonSize: Number(e.target.value) })}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">px</InputAdornment>,
                      }}
                      fullWidth
                    />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Căn lề Phải
                    </Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={form.marginRight ?? 20}
                      onChange={(e) => setForm({ ...form, marginRight: Number(e.target.value) })}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">px</InputAdornment>,
                      }}
                      fullWidth
                    />
                  </Box>
                </Stack>

                <Stack direction="row" spacing={2}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Lề trên dưới website
                    </Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={form.marginBottom ?? 20}
                      onChange={(e) => setForm({ ...form, marginBottom: Number(e.target.value) })}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">px</InputAdornment>,
                      }}
                      fullWidth
                    />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      Lề trên dưới mobile
                    </Typography>
                    <TextField
                      size="small"
                      type="number"
                      value={form.marginBottomMobile ?? 20}
                      onChange={(e) => setForm({ ...form, marginBottomMobile: Number(e.target.value) })}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">px</InputAdornment>,
                      }}
                      fullWidth
                    />
                  </Box>
                </Stack>
              </Stack>
            </Section>

            <Divider sx={{ my: 3 }} />

            {/* Colors */}
            <Section icon={<PaletteIcon />} title="Màu sắc">
              <Stack spacing={2}>
                {/* Primary Color */}
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Chọn màu chính
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <ColorSwatch
                      color="transparent"
                      selected={false}
                      onClick={() => setShowColorPicker(!showColorPicker)}
                      showPicker
                    />
                    {COLOR_PALETTE.map((color) => (
                      <ColorSwatch
                        key={color}
                        color={color}
                        selected={form.primaryColor === color}
                        onClick={() => setForm({ ...form, primaryColor: color })}
                      />
                    ))}
                  </Stack>
                  {showColorPicker && (
                    <TextField
                      size="small"
                      type="color"
                      value={form.primaryColor || '#3B82F6'}
                      onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                      sx={{ mt: 1, width: 80 }}
                    />
                  )}
                </Box>

                {/* Text Color */}
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Chọn màu chữ
                  </Typography>
                  <Stack direction="row" spacing={1}>
                    <Box
                      onClick={() => setForm({ ...form, textColor: 'dark' })}
                      sx={{
                        width: 32,
                        height: 32,
                        bgcolor: '#1F2937',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        border: '3px solid',
                        borderColor: form.textColor === 'dark' ? 'primary.main' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {form.textColor === 'dark' && <CheckIcon sx={{ color: 'white', fontSize: 16 }} />}
                    </Box>
                    <Box
                      onClick={() => setForm({ ...form, textColor: 'light' })}
                      sx={{
                        width: 32,
                        height: 32,
                        bgcolor: 'white',
                        border: '2px solid',
                        borderColor: form.textColor === 'light' ? 'primary.main' : 'grey.300',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {form.textColor === 'light' && <CheckIcon sx={{ color: 'grey.800', fontSize: 16 }} />}
                    </Box>
                  </Stack>
                </Box>
              </Stack>
            </Section>

            <Divider sx={{ my: 3 }} />

            {/* Button Icon */}
            <Section icon={<ChatIcon />} title="Biểu tượng nút">
              <Stack direction="row" spacing={2}>
                {(['chat', 'message', 'messenger', 'custom'] as const).map((icon) => (
                  <IconPreview
                    key={icon}
                    icon={icon}
                    selected={form.buttonIcon === icon}
                    onClick={() => setForm({ ...form, buttonIcon: icon })}
                  />
                ))}
              </Stack>
              {form.buttonIcon === 'custom' && (
                <TextField
                  fullWidth
                  size="small"
                  placeholder="https://example.com/icon.png"
                  value={form.customIconUrl || ''}
                  onChange={(e) => setForm({ ...form, customIconUrl: e.target.value })}
                  sx={{ mt: 2 }}
                />
              )}
            </Section>

            <Divider sx={{ my: 3 }} />

            {/* Avatar */}
            <Section
              icon={<PersonIcon />}
              title="Avatar của trang"
              description="Tên và avatar của trang sẽ hiển thị khi chat với khách hàng"
            >
              <Stack spacing={2}>
                <TextField
                  size="small"
                  placeholder="Nhập tên trang"
                  value={form.avatarName || ''}
                  onChange={(e) => setForm({ ...form, avatarName: e.target.value })}
                  sx={{ maxWidth: 300 }}
                />
                <Box
                  sx={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    bgcolor: form.primaryColor || '#3B82F6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 32,
                    fontWeight: 600,
                  }}
                >
                  {form.avatarName?.[0]?.toUpperCase() || 'W'}
                </Box>
              </Stack>
            </Section>

            <Divider sx={{ my: 3 }} />

            {/* Window Height */}
            <Section icon={<HeightIcon />} title="Chiều cao khung hội thoại">
              <Stack spacing={2}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
                    Cài đặt chiều cao của khung hội thoại trên mobile
                  </Typography>
                  <TextField
                    size="small"
                    type="number"
                    value={form.windowHeightMobile ?? 80}
                    onChange={(e) => setForm({ ...form, windowHeightMobile: Number(e.target.value) })}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">%</InputAdornment>,
                    }}
                    sx={{ width: 120 }}
                  />
                </Stack>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 200 }}>
                    Cài đặt chiều cao của khung hội thoại trên website
                  </Typography>
                  <TextField
                    size="small"
                    type="number"
                    value={form.windowHeight ?? 550}
                    onChange={(e) => setForm({ ...form, windowHeight: Number(e.target.value) })}
                    sx={{ width: 80 }}
                  />
                  <FormControl size="small" sx={{ width: 80 }}>
                    <Select
                      value={form.windowHeightUnit || 'px'}
                      onChange={(e) => setForm({ ...form, windowHeightUnit: e.target.value as '%' | 'px' })}
                    >
                      <MenuItem value="px">px</MenuItem>
                      <MenuItem value="%">%</MenuItem>
                    </Select>
                  </FormControl>
                </Stack>
              </Stack>
            </Section>
          </Box>
        </TabPanel>

        {/* Tab 2: Biểu mẫu (Form Template) */}
        <TabPanel value={activeTab} index={1}>
          <Box sx={{ px: 3 }}>
            {/* Language */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
              <Typography variant="body2" color="text.secondary">
                Chọn phiên bản ngôn ngữ
              </Typography>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <Select defaultValue="vi">
                  <MenuItem value="vi">Tiếng Việt</MenuItem>
                  <MenuItem value="en">English</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            {/* Greeting Title */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Tiêu đề biểu mẫu
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="Chào mừng bạn đến với . Vui lòng nhập thông tin trước khi bắt..."
                value={form.greeting || ''}
                onChange={(e) => setForm({ ...form, greeting: e.target.value })}
              />
            </Box>

            {/* Tabs for form types */}
            <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
              <Button variant="text" startIcon={<span>🏠</span>} sx={{ textTransform: 'none' }}>
                Trang chủ
              </Button>
              <Button variant="text" startIcon={<span>⚙️</span>} sx={{ textTransform: 'none', color: 'text.secondary' }}>
                Khác
              </Button>
            </Stack>

            {/* Pre-chat form description */}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Yêu cầu khách cung cấp thông tin cá nhân của họ (ví dụ: email) trước khi cuộc trò chuyện bắt đầu
            </Typography>

            {/* Form type tabs */}
            <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
              <Button
                variant={form.preChatForm ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setForm({ ...form, preChatForm: true })}
                sx={{ textTransform: 'none' }}
              >
                📋 Mẫu liên hệ
              </Button>
              <Button
                variant={!form.preChatForm ? 'contained' : 'outlined'}
                size="small"
                onClick={() => setForm({ ...form, preChatForm: false })}
                sx={{ textTransform: 'none' }}
              >
                💬 Câu hỏi thường gặp
              </Button>
            </Stack>

            {/* Form fields */}
            {form.preChatForm && (
              <Box>
                <FieldRow
                  field="name"
                  label="Tên"
                  placeholder="Tên của bạn"
                  enabled={form.preChatFields?.includes('name') ?? false}
                  onToggle={() => handleFieldToggle('name')}
                />
                <FieldRow
                  field="phone"
                  label="Số điện thoại"
                  placeholder="Số điện thoại của bạn"
                  enabled={form.preChatFields?.includes('phone') ?? false}
                  onToggle={() => handleFieldToggle('phone')}
                />
                <FieldRow
                  field="email"
                  label="Email"
                  placeholder="Email của bạn"
                  enabled={form.preChatFields?.includes('email') ?? false}
                  onToggle={() => handleFieldToggle('email')}
                />
                <FieldRow
                  field="message"
                  label="Tin nhắn"
                  placeholder="Nhập tin nhắn của bạn"
                  enabled={form.preChatFields?.includes('message') ?? false}
                  onToggle={() => handleFieldToggle('message')}
                />

                <Button
                  startIcon={<AddIcon />}
                  sx={{ mt: 2, textTransform: 'none', color: 'primary.main' }}
                >
                  Thêm nội dung
                </Button>
              </Box>
            )}
          </Box>
        </TabPanel>

        {/* Tab 3: Chức năng (Features) */}
        <TabPanel value={activeTab} index={2}>
          <Box sx={{ px: 3 }}>
            {/* Button Animation */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ py: 2, borderBottom: '1px solid', borderColor: 'grey.100' }}
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <AutoAwesomeIcon sx={{ color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body1">Hiệu ứng nút</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Thêm hiệu ứng động cho bong bóng live chat
                  </Typography>
                </Box>
              </Stack>
              <Switch />
            </Stack>

            {/* Auto Open */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ py: 2, borderBottom: '1px solid', borderColor: 'grey.100' }}
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <OpenInBrowserIcon sx={{ color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body1">Tự động mở</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Mở khung chat khi người dùng truy cập website ở thiết bị:
                  </Typography>
                </Box>
              </Stack>
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <Select defaultValue="off">
                  <MenuItem value="off">Tắt</MenuItem>
                  <MenuItem value="desktop">Desktop</MenuItem>
                  <MenuItem value="mobile">Mobile</MenuItem>
                  <MenuItem value="all">Tất cả</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            {/* New Message Notification */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ py: 2, borderBottom: '1px solid', borderColor: 'grey.100' }}
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <NotificationsIcon sx={{ color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body1">Thông báo tin nhắn mới</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Thông báo có tin nhắn mới tại nút chat
                  </Typography>
                </Box>
              </Stack>
              <Switch />
            </Stack>

            {/* Default Language */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ py: 2, borderBottom: '1px solid', borderColor: 'grey.100' }}
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <LanguageIcon sx={{ color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body1">Ngôn ngữ mặc định</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Chọn ngôn ngữ hiển thị mặc định cho live chat
                  </Typography>
                </Box>
              </Stack>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <Select defaultValue="vi">
                  <MenuItem value="vi">Tiếng Việt</MenuItem>
                  <MenuItem value="en">English</MenuItem>
                  <MenuItem value="th">ภาษาไทย</MenuItem>
                  <MenuItem value="id">Indonesia</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            {/* Quick Replies */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ py: 2, borderBottom: '1px solid', borderColor: 'grey.100' }}
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <QuestionAnswerIcon sx={{ color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body1">Câu trả lời nhanh</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Cài đặt chi tiết tin nhắn cho câu trả lời nhanh
                  </Typography>
                </Box>
              </Stack>
              <Button variant="text" sx={{ textTransform: 'none' }}>
                Cài đặt mẫu câu
              </Button>
            </Stack>

            {/* Rating */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ py: 2 }}
            >
              <Stack direction="row" spacing={2} alignItems="center">
                <StarIcon sx={{ color: 'text.secondary' }} />
                <Box>
                  <Typography variant="body1">Đánh giá dịch vụ hỗ trợ</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Cài đặt chi tiết đánh giá dịch vụ hỗ trợ
                  </Typography>
                </Box>
              </Stack>
              <Button variant="text" sx={{ textTransform: 'none' }}>
                Cài đặt
              </Button>
            </Stack>
          </Box>
        </TabPanel>

        {/* Tab 4: Plugin code */}
        <TabPanel value={activeTab} index={3}>
          <Box sx={{ px: 3 }}>
            {/* Domain */}
            <Section icon={<LanguageIcon />} title="Tên miền">
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Domain mà bong bóng chat của bạn sẽ hiển thị
              </Typography>
              <TextField
                fullWidth
                size="small"
                placeholder="Ex: https://pancake.vn, pages.fm, etc..."
              />
            </Section>

            <Divider sx={{ my: 3 }} />

            {/* Embed Code */}
            <Section icon={<CopyIcon />} title="Code cài đặt plugin">
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Đặt đoạn code dưới đây vào trong thẻ {'<body> </body>'}
              </Typography>
              <Box
                sx={{
                  bgcolor: 'grey.50',
                  p: 2,
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: 13,
                  wordBreak: 'break-all',
                  position: 'relative',
                }}
              >
                <code>{embedCode}</code>
                <IconButton
                  size="small"
                  onClick={handleCopyCode}
                  sx={{ position: 'absolute', top: 8, right: 8 }}
                >
                  {copied ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
                </IconButton>
              </Box>

              {/* Custom Parameters */}
              <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                Tham số tuỳ chỉnh
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Nếu không sử dụng tham số tuỳ chỉnh, hệ thống sẽ áp dụng theo cài đặt của trang.
              </Typography>

              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <Box component="tr" sx={{ borderBottom: '1px solid', borderColor: 'grey.200' }}>
                    <Box component="th" sx={{ p: 1, textAlign: 'left', fontWeight: 500 }}>Name</Box>
                    <Box component="th" sx={{ p: 1, textAlign: 'left', fontWeight: 500 }}>Type</Box>
                    <Box component="th" sx={{ p: 1, textAlign: 'left', fontWeight: 500 }}>Description</Box>
                  </Box>
                </thead>
                <tbody>
                  <Box component="tr" sx={{ borderBottom: '1px solid', borderColor: 'grey.100' }}>
                    <Box component="td" sx={{ p: 1 }}>locale</Box>
                    <Box component="td" sx={{ p: 1 }}>String</Box>
                    <Box component="td" sx={{ p: 1, color: 'text.secondary' }}>
                      Dùng để cài đặt ngôn ngữ cho hộp thoại. Các giá trị hợp lệ: vi (Việt Nam), en (English), th (Thailand), id (Indonesia)
                    </Box>
                  </Box>
                </tbody>
              </Box>

              {/* API Functions */}
              <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                Hàm mở hội thoại chat
              </Typography>
              <Box
                sx={{
                  bgcolor: 'grey.50',
                  p: 1.5,
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: 13,
                }}
              >
                window.MiAgent.open()
              </Box>

              <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                Hàm đóng hội thoại chat
              </Typography>
              <Box
                sx={{
                  bgcolor: 'grey.50',
                  p: 1.5,
                  borderRadius: 1,
                  fontFamily: 'monospace',
                  fontSize: 13,
                }}
              >
                window.MiAgent.close()
              </Box>
            </Section>
          </Box>
        </TabPanel>

        {/* Save Button */}
        <Divider />
        <Box sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={updateConfig.isPending}
            >
              {updateConfig.isPending ? <CircularProgress size={20} /> : 'Lưu cài đặt'}
            </Button>
            {updateConfig.isSuccess && (
              <Alert severity="success" sx={{ py: 0 }}>Đã lưu!</Alert>
            )}
          </Stack>
        </Box>
      </Paper>

      {/* Widget is injected directly into the page */}
      {config && (
        <WidgetPreview
          orgSlug={config.organizationSlug}
          refreshKey={previewKey}
        />
      )}
    </Box>
  );
}
