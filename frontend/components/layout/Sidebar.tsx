"use client";

import { useRouter, usePathname } from "next/navigation";
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
} from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import HubIcon from "@mui/icons-material/Hub";
import GroupsIcon from "@mui/icons-material/Groups";
import WidgetsIcon from "@mui/icons-material/Widgets";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import SettingsIcon from "@mui/icons-material/Settings";

const drawerWidth = 240;

interface MenuItem {
  text: string;
  icon: React.ReactNode;
  path: string;
}

interface MenuSection {
  title?: string;
  items: MenuItem[];
}

// Function to generate menu sections with org slug
const getMenuSections = (orgSlug: string): MenuSection[] => [
  {
    items: [
      { text: "Conversations", icon: <ChatIcon />, path: `/organizations/${orgSlug}/conversations` },
      { text: "Channels", icon: <HubIcon />, path: `/organizations/${orgSlug}/channels` },
      { text: "Widget", icon: <WidgetsIcon />, path: `/organizations/${orgSlug}/widget` },
      { text: "AI Agent", icon: <SmartToyIcon />, path: `/organizations/${orgSlug}/ai-agent` },
      { text: "Members", icon: <GroupsIcon />, path: `/organizations/${orgSlug}/team` },
    ],
  },
  {
    items: [
      { text: "Settings", icon: <SettingsIcon />, path: `/organizations/${orgSlug}/settings` },
    ],
  },
];

interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
  orgSlug?: string;
}

export default function Sidebar({ mobileOpen, onMobileClose, orgSlug }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const menuSections = orgSlug ? getMenuSections(orgSlug) : [];

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
              return (
                <ListItem key={item.text} disablePadding>
                  <ListItemButton selected={isActive} onClick={() => handleNavigation(item.path)}>
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.text} />
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
