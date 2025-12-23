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
  Toolbar,
  Divider,
  Badge,
} from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import PeopleIcon from "@mui/icons-material/People";
import HubIcon from "@mui/icons-material/Hub";
import GroupsIcon from "@mui/icons-material/Groups";
import WidgetsIcon from "@mui/icons-material/Widgets";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import SettingsIcon from "@mui/icons-material/Settings";

const drawerWidth = 240;

interface NavMenuItem {
  textKey: string;
  icon: React.ReactNode;
  path: string;
}

interface MenuSection {
  title?: string;
  items: NavMenuItem[];
}

// Function to generate menu sections with org slug
const getMenuSections = (orgSlug: string): MenuSection[] => [
  {
    items: [
      { textKey: "conversations", icon: <ChatIcon />, path: `/organizations/${orgSlug}/conversations` },
      { textKey: "customers", icon: <PeopleIcon />, path: `/organizations/${orgSlug}/customers` },
      { textKey: "channels", icon: <HubIcon />, path: `/organizations/${orgSlug}/channels` },
      { textKey: "widget", icon: <WidgetsIcon />, path: `/organizations/${orgSlug}/widget` },
      { textKey: "aiAgent", icon: <SmartToyIcon />, path: `/organizations/${orgSlug}/ai-agent` },
      { textKey: "members", icon: <GroupsIcon />, path: `/organizations/${orgSlug}/members` },
    ],
  },
  {
    items: [
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
      <Toolbar />
      <Divider />
      {menuSections.map((section, index) => (
        <Box key={index}>
          {index > 0 && <Divider />}
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
      sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
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
          display: { xs: "block", sm: "none" },
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
          },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", sm: "block" },
          "& .MuiDrawer-paper": {
            width: drawerWidth,
            boxSizing: "border-box",
          },
        }}
        open
      >
        {drawerContent}
      </Drawer>
    </Box>
  );
}
