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
  Collapse,
} from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";
import SettingsIcon from "@mui/icons-material/Settings";
import ExtensionIcon from "@mui/icons-material/Extension";
import LinkIcon from "@mui/icons-material/Link";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import QuestionAnswerIcon from "@mui/icons-material/QuestionAnswer";
import WidgetsIcon from "@mui/icons-material/Widgets";
import PersonIcon from "@mui/icons-material/Person";
import BusinessIcon from "@mui/icons-material/Business";
import ExpandLess from "@mui/icons-material/ExpandLess";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { useState } from "react";

const drawerWidth = 240;

interface MenuItem {
  text: string;
  icon: React.ReactNode;
  path: string;
  children?: MenuItem[];
}

// Function to generate menu items with org slug
const getMenuItems = (orgSlug: string): MenuItem[] => [
  { text: "Conversations", icon: <ChatIcon />, path: `/organizations/${orgSlug}/conversations` },
  {
    text: "Integrations",
    icon: <ExtensionIcon />,
    path: `/organizations/${orgSlug}/integrations`,
    children: [
      { text: "Connections", icon: <LinkIcon />, path: `/organizations/${orgSlug}/integrations/connections` },
      { text: "AI Agents", icon: <SmartToyIcon />, path: `/organizations/${orgSlug}/integrations/ai-agents` },
      { text: "Quick Replies", icon: <QuestionAnswerIcon />, path: `/organizations/${orgSlug}/integrations/quick-replies` },
      { text: "Widget", icon: <WidgetsIcon />, path: `/organizations/${orgSlug}/integrations/widget` },
    ],
  },
  {
    text: "Settings",
    icon: <SettingsIcon />,
    path: `/organizations/${orgSlug}/settings`,
    children: [
      { text: "Organization", icon: <BusinessIcon />, path: `/organizations/${orgSlug}/settings/organization` },
      { text: "Profile", icon: <PersonIcon />, path: "/settings/profile" },
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
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    Integrations: true,
    Settings: true,
  });

  // Get menu items based on org slug
  const menuItems = orgSlug ? getMenuItems(orgSlug) : [];

  const handleNavigation = (path: string) => {
    router.push(path);
    onMobileClose();
  };

  const toggleMenu = (menuText: string) => {
    setOpenMenus((prev) => ({ ...prev, [menuText]: !prev[menuText] }));
  };

  const renderMenuItem = (item: MenuItem, depth = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isOpen = openMenus[item.text] ?? false;
    const isActive = pathname === item.path || pathname.startsWith(item.path + "/");

    if (hasChildren) {
      return (
        <Box key={item.text}>
          <ListItem disablePadding>
            <ListItemButton onClick={() => toggleMenu(item.text)}>
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
              {isOpen ? <ExpandLess /> : <ExpandMore />}
            </ListItemButton>
          </ListItem>
          <Collapse in={isOpen} timeout="auto" unmountOnExit>
            <List component="div" disablePadding>
              {item.children!.map((child) => (
                <ListItem key={child.text} disablePadding>
                  <ListItemButton
                    sx={{ pl: 4 }}
                    selected={pathname === child.path || pathname.startsWith(child.path + "/")}
                    onClick={() => handleNavigation(child.path)}
                  >
                    <ListItemIcon>{child.icon}</ListItemIcon>
                    <ListItemText primary={child.text} />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Collapse>
        </Box>
      );
    }

    return (
      <ListItem key={item.text} disablePadding>
        <ListItemButton selected={isActive} onClick={() => handleNavigation(item.path)}>
          <ListItemIcon>{item.icon}</ListItemIcon>
          <ListItemText primary={item.text} />
        </ListItemButton>
      </ListItem>
    );
  };

  const drawerContent = (
    <>
      <Toolbar />
      <Divider />
      <List>{menuItems.map((item) => renderMenuItem(item))}</List>
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
          keepMounted: true, // Better open performance on mobile
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
