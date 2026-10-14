"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bell, Menu, LogOut, HelpCircle, ChevronDown } from "lucide-react";
import { GlobalSearch } from "@/components/crm/global-search";
import { useAuth } from "@/contexts/auth-context";
import { notificationApi, profileApi } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AdminHomeProfile {
  id: string;
  name: string;
}

function profileSlug(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function responseItems(response: any) {
  const data = response?.data?.data ?? response?.data;
  return Array.isArray(data) ? data : data?.profiles ?? [];
}

interface HeaderProps {
  onMenuClick: () => void;
}

interface HeaderNotification {
  id: string;
  title: string;
  message: string;
  referenceId?: string | null;
  referenceType?: string | null;
  isRead: boolean;
  createdAt: string;
}

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const { user, profile, roles = [], tenant, logout, isAdmin, isSuperAdmin } = useAuth();
  const searchParams = useSearchParams();
  const isAuthenticated = Boolean(user);
  const showHomeSelector = isAuthenticated && isAdmin && !isSuperAdmin;
  const [adminHomeOpen, setAdminHomeOpen] = React.useState(false);
  const [userDetailsOpen, setUserDetailsOpen] = React.useState(false);
  const [adminProfiles, setAdminProfiles] = React.useState<AdminHomeProfile[]>([]);
  const dropdownRefreshId = React.useRef(0);
  const [notifications, setNotifications] = React.useState<HeaderNotification[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = React.useState(0);

  const refreshNotifications = React.useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      setNotificationUnreadCount(0);
      return;
    }
    try {
      const response = await notificationApi.list({ page: 1, limit: 10 });
      const items = Array.isArray(response.data.data) ? response.data.data as HeaderNotification[] : [];
      setNotifications(items);
      setNotificationUnreadCount(Number((response.data as any).unreadCount ?? items.filter((item) => !item.isRead).length));
    } catch (error) {
      console.error("Failed to load notifications:", error);
    }
  }, [isAuthenticated]);

  React.useEffect(() => {
    void refreshNotifications();
    const interval = window.setInterval(() => void refreshNotifications(), 10000);
    return () => window.clearInterval(interval);
  }, [refreshNotifications]);

  const refreshAdminDropdownData = React.useCallback(() => {
    if (!isAuthenticated || !isAdmin || isSuperAdmin) {
      dropdownRefreshId.current += 1;
      setAdminProfiles([]);
      return;
    }

    const refreshId = ++dropdownRefreshId.current;
    profileApi.list({ limit: 100 })
      .then((profilesResponse) => {
        const profileItems = responseItems(profilesResponse) as Array<{ id?: string; name?: string }>;
        const uniqueProfiles: AdminHomeProfile[] = Array.from(
          new Map(
            profileItems
              .filter((item) => !!item?.id && !!item?.name)
              .map((item) => [item.id as string, { id: item.id as string, name: item.name as string }])
          ).values()
        ).sort((a, b) => a.name.localeCompare(b.name));

        if (refreshId === dropdownRefreshId.current) {
          setAdminProfiles(uniqueProfiles);
        }
      })
      .catch((error) => {
        console.error("Failed to load admin profiles:", error);
      });
  }, [isAdmin, isAuthenticated, isSuperAdmin]);

  React.useEffect(() => {
    refreshAdminDropdownData();
  }, [refreshAdminDropdownData]);

  const unreadCount = notificationUnreadCount;

  const openNotification = async (notification: HeaderNotification) => {
    if (!notification.isRead) {
      try {
        await notificationApi.markRead(notification.id);
        setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, isRead: true } : item));
        setNotificationUnreadCount((count) => Math.max(0, count - 1));
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    }
    if (notification.referenceType === "Quotation" && notification.referenceId) {
      router.push(`/quotations/${notification.referenceId}`);
    }
  };

  const userInitials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "U"
    : "U";

  const userName = user
    ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User"
    : "User";

  const handleLogout = async () => {
    await logout();
  };

  const selectedProfileId = searchParams.get("profileId");
  const selectedProfile = adminProfiles.find((item) => item.id === selectedProfileId);

  const handleProfileNavigation = (selected: AdminHomeProfile) => {
    setAdminHomeOpen(false);
    const profileParams = new URLSearchParams({
      profileId: selected.id,
      profileLabel: selected.name,
    });
    router.push(`/profiles/${profileSlug(selected.name)}?${profileParams}`);
  };

  const handleAdminHomeNavigation = () => {
    setAdminHomeOpen(false);
    router.push("/dashboard");
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-sky-100 bg-[#eef8ff] px-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,700px)_minmax(0,1fr)]">
        <div className="flex shrink-0 items-center">
          <Button variant="ghost" size="icon" onClick={onMenuClick} className="lg:hidden">
            <Menu className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex min-w-0 flex-1 justify-center lg:w-full">
          <GlobalSearch />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1">
          {showHomeSelector && (
            <DropdownMenu
              modal={false}
              open={adminHomeOpen}
              onOpenChange={(isOpen) => {
                setAdminHomeOpen(isOpen);
                if (isOpen) {
                  refreshAdminDropdownData();
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-9 border border-sky-100 bg-white px-3 text-sm font-medium text-foreground shadow-sm"
                >
                  <span className="max-w-48 truncate">
                    {selectedProfile?.name || "Admin Home"}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto">
                <DropdownMenuItem onSelect={handleAdminHomeNavigation} className="text-sm">
                  Admin Home
                </DropdownMenuItem>
                {adminProfiles.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Profiles</DropdownMenuLabel>
                    {adminProfiles.map((item) => (
                      <DropdownMenuItem
                        key={`profile-${item.id}`}
                        onSelect={() => handleProfileNavigation(item)}
                        className="text-sm"
                      >
                        {item.name}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[11px] leading-none"
                  >
                    {unreadCount}
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">No notifications</p>
              ) : notifications.map((notification) => (
                <DropdownMenuItem key={notification.id} onSelect={() => void openNotification(notification)} className="flex flex-col items-start gap-0.5">
                  <span className={cn("text-[13px]", !notification.isRead && "font-medium")}>
                    {notification.title}
                  </span>
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">{notification.message}</span>
                  <span className="text-[11px] text-muted-foreground">{new Date(notification.createdAt).toLocaleString("en-IN")}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <HelpCircle className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => window.open("https://dctcrm.com/help", "_blank")}>
                Help Center
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open("https://dctcrm.com/docs", "_blank")}>
                Documentation
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open("mailto:support@dctcrm.com")}>
                Contact Support
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="ghost"
            className="h-8 max-w-40 truncate px-2 text-sm"
            onClick={() => setUserDetailsOpen(true)}
          >
            {profile?.name || userName}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full" aria-label="Open user menu">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.avatar || ""} alt={userName} />
                  <AvatarFallback>{userInitials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-0.5">
                  <p className="text-[13px] font-medium">{userName}</p>
                  <p className="text-[11px] text-muted-foreground">{user?.email || ""}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <Dialog open={userDetailsOpen} onOpenChange={setUserDetailsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{userName}</DialogTitle>
            <DialogDescription>Logged-in user details</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="font-medium">{user?.email || "Not provided"}</dd>
            </div>
            {user?.phone && (
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="font-medium">{user.phone}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Profile</dt>
              <dd className="font-medium">{profile?.name || (isSuperAdmin ? "Super Admin" : "Not assigned")}</dd>
            </div>
            {roles.length > 0 && (
              <div>
                <dt className="text-muted-foreground">Roles</dt>
                <dd className="font-medium">{roles.join(", ")}</dd>
              </div>
            )}
            {tenant?.name && (
              <div>
                <dt className="text-muted-foreground">Company</dt>
                <dd className="font-medium">{tenant.name}</dd>
              </div>
            )}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}