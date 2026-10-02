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
import ChatIcon from "@mui/icons-material/Chat";
import PeopleIcon from "@mui/icons-material/People";
import HubIcon from "@mui/icons-material/Hub";
import GroupsIcon from "@mui/icons-material/Groups";
import WidgetsIcon from "@mui/icons-material/Widgets";
import SettingsIcon from "@mui/icons-material/Settings";
import IntegrationInstructionsIcon from "@mui/icons-material/IntegrationInstructions";

const drawerWidth = 248;

interface NavMenuItem {
  textKey: string;
  icon: React.ReactNode;
  path: string;
}

interface MenuSection {
  title: "workspace" | "management" | "organization";
  items: NavMenuItem[];
}

// Function to generate menu sections with org slug
const getMenuSections = (orgSlug: string): MenuSection[] => [
  {
    title: "workspace",
    items: [
      { textKey: "conversations", icon: <ChatIcon />, path: `/organizations/${orgSlug}/conversations` },
      { textKey: "customers", icon: <PeopleIcon />, path: `/organizations/${orgSlug}/customers` },
      { textKey: "channels", icon: <HubIcon />, path: `/organizations/${orgSlug}/channels` },
    ],
  },
  {
    title: "management",
    items: [
      { textKey: "widget", icon: <WidgetsIcon />, path: `/organizations/${orgSlug}/widget` },
      { textKey: "members", icon: <GroupsIcon />, path: `/organizations/${orgSlug}/members` },
    ],
  },
  {
    title: "organization",
    items: [
      { textKey: "integrations", icon: <IntegrationInstructionsIcon />, path: `/organizations/${orgSlug}/integrations` },
      { textKey: "settings", icon: <SettingsIcon />, path: `/organizations/${orgSlug}/settings` },
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

  const menuSections = orgSlug ? getMenuSections(orgSlug) : [];
  const conversationsPath = orgSlug ? `/organizations/${orgSlug}/conversations` : "";

  const handleNavigation = (path: string) => {
    router.push(path);
    onMobileClose();
  };

  const drawerContent = (
    <>
      {menuSections.map((section, index) => (
        <Box key={section.title} className="organization-nav-section">
          <Typography className="organization-nav-label">{t(section.title)}</Typography>
          <List>
            {section.items.map((item) => {
              const isActive = pathname === item.path || pathname.startsWith(item.path + "/");
              const isConversations = item.path === conversationsPath;
              const text = t(item.textKey);
              return (
                <ListItem key={item.textKey} disablePadding>
                  <ListItemButton selected={isActive} onClick={() => handleNavigation(item.path)}>
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText
                      primary={
                        isConversations && unreadCount > 0
                          ? <Badge badgeContent={unreadCount} color="error" sx={{ '& .MuiBadge-badge': { right: -16, top: 8 } }}>{text}</Badge>
                          : text
                      }
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>
      ))}
    </>
  );

  return (
    <Box
      component="nav"
      className="organization-sidebar"
      sx={{ width: { xs: 0, md: 248 }, flexShrink: 0 }}
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
