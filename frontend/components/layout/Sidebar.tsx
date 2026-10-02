"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Badge,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ForumIcon from "@mui/icons-material/Forum";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import WidgetsOutlinedIcon from "@mui/icons-material/WidgetsOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ApiOutlinedIcon from "@mui/icons-material/ApiOutlined";
import QuickreplyOutlinedIcon from "@mui/icons-material/QuickreplyOutlined";

const drawerWidth = 204;

interface NavMenuItem {
  textKey: string;
  fallbackText: string;
  icon: React.ReactNode;
  path: string;
  badge?: number;
}

interface MenuSection {
  title?: string;
  items: NavMenuItem[];
}

// Function to generate menu sections with org slug
const getMenuSections = (orgSlug: string, unreadCount: number): MenuSection[] => [
  {
    items: [
      { textKey: "conversations", fallbackText: "Hội thoại", icon: <ForumIcon />, path: `/organizations/${orgSlug}/conversations`, badge: unreadCount },
      { textKey: "customers", fallbackText: "Khách hàng", icon: <PeopleAltOutlinedIcon />, path: `/organizations/${orgSlug}/customers` },
      { textKey: "channels", fallbackText: "Kênh kết nối", icon: <HubOutlinedIcon />, path: `/organizations/${orgSlug}/channels` },
    ],
  },
  {
    title: "TIỆN ÍCH",
    items: [
      { textKey: "widget", fallbackText: "Widget Chat", icon: <WidgetsOutlinedIcon />, path: `/organizations/${orgSlug}/widget` },
      { textKey: "quickReplies", fallbackText: "Tin nhắn mẫu", icon: <QuickreplyOutlinedIcon />, path: `/organizations/${orgSlug}/quick-replies` },
      { textKey: "members", fallbackText: "Thành viên", icon: <GroupOutlinedIcon />, path: `/organizations/${orgSlug}/members` },
      { textKey: "integrations", fallbackText: "Tích hợp API", icon: <ApiOutlinedIcon />, path: `/organizations/${orgSlug}/integrations` },
    ],
  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  orgSlug?: string;
  unreadCount?: number;
}

export default function Sidebar({ mobileOpen, onMobileClose, orgSlug, unreadCount = 0 }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("nav");

  const menuSections = orgSlug ? getMenuSections(orgSlug, unreadCount) : [];
  const settingsPath = orgSlug ? `/organizations/${orgSlug}/settings` : "/settings";
  const isSettingsActive = pathname === settingsPath || pathname.startsWith(settingsPath + "/");

  const handleNavigation = (path: string) => {
    router.push(path);
    onMobileClose();
  };

  const drawerContent = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Haravan Sidebar Search */}
      <Box className="sidebar-search-box" sx={{ mb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <SearchIcon sx={{ fontSize: 15, color: "#6d7175" }} />
          <Typography component="span" sx={{ fontSize: "12px", color: "#6d7175" }}>
            Tìm kiếm
          </Typography>
        </Box>
        <span className="sidebar-search-key">Ctrl K</span>
      </Box>

      {/* Nav List */}
      <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
        {menuSections.map((section, sIndex) => (
          <Box key={sIndex} className="organization-nav-section" sx={{ mb: 1 }}>
            {section.title && (
              <Typography className="organization-nav-label">
                {section.title}
              </Typography>
            )}
            <List sx={{ py: 0.25 }}>
              {section.items.map((item) => {
                const isActive = pathname === item.path || pathname.startsWith(item.path + "/");
                let label = item.fallbackText;
                try {
                  const translated = t(item.textKey);
                  if (translated && !translated.startsWith("nav.")) {
                    label = translated;
                  }
                } catch {
                  // fallback
                }

                return (
                  <ListItem key={item.textKey} disablePadding sx={{ mb: 0.25 }}>
                    <ListItemButton
                      selected={isActive}
                      onClick={() => handleNavigation(item.path)}
                      sx={{
                        py: 0.6,
                        px: 1,
                        borderRadius: "6px",
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 24 }}>
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText
                        primary={label}
                        primaryTypographyProps={{
                          fontSize: "12.5px",
                          fontWeight: isActive ? 600 : 400,
                          lineHeight: "18px",
                        }}
                      />
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="organization-sidebar-badge has-unread">
                          {item.badge}
                        </span>
                      )}
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      {/* Pinned Bottom Settings like Haravan Cấu hình */}
      <Box className="organization-sidebar-bottom">
        <ListItem disablePadding>
          <ListItemButton
            selected={isSettingsActive}
            onClick={() => handleNavigation(settingsPath)}
            sx={{
              py: 0.6,
              px: 1,
              borderRadius: "6px",
            }}
          >
            <ListItemIcon sx={{ minWidth: 24 }}>
              <SettingsOutlinedIcon />
            </ListItemIcon>
            <ListItemText
              primary="Cấu hình"
              primaryTypographyProps={{
                fontSize: "12.5px",
                fontWeight: isSettingsActive ? 600 : 400,
                lineHeight: "18px",
              }}
            />
          </ListItemButton>
        </ListItem>
      </Box>
    </Box>
  );

  return (
    <Box
      component="nav"
      className="organization-sidebar"
      sx={{ width: { xs: 0, md: drawerWidth }, flexShrink: 0 }}
    >
      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{
          keepMounted: true,
        }}
        sx={{
          display: { xs: "block", md: "none" },
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
          },
        }}
        PaperProps={{ className: "organization-sidebar-paper" }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
          },
        }}
        PaperProps={{ className: "organization-sidebar-paper" }}
        open
      >
        {drawerContent}
      </Drawer>
    </Box>
  );
}
