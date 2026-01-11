import { useEffect, useState } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { NavLink } from '@/components/NavLink';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Play,
  History,
  TestTube,
  FolderOpen,
  Settings,
  LogOut,
  Moon,
  Sun,
  LayoutDashboard,
  FileCheck,
  FileText,
  GraduationCap,
  ClipboardList,
  Languages,
} from 'lucide-react';
import pwcLogo from '@/assets/pwc-logo.png';

export default function DashboardLayout() {
  const { t, i18n } = useTranslation();
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isDark, setIsDark] = useState(false);

  const testingItems = [
    { title: t('nav.dashboard'), url: '/dashboard', icon: LayoutDashboard },
    { title: t('nav.newTask'), url: '/dashboard/new-task', icon: Play },
    { title: t('nav.taskHistory'), url: '/dashboard/history', icon: History },
    { title: t('nav.testOverview'), url: '/dashboard/tests', icon: ClipboardList },
    { title: t('nav.testGenerator'), url: '/dashboard/test-generator', icon: TestTube },
    { title: t('nav.docVerify'), url: '/dashboard/doc-verify', icon: FileCheck },
    { title: t('nav.projects'), url: '/dashboard/projects', icon: FolderOpen },
  ];

  const operationItems = [
    { title: t('nav.dashboard'), url: '/dashboard/operations', icon: LayoutDashboard },
    { title: t('nav.newOperation'), url: '/dashboard/operations/new', icon: Play },
    { title: t('nav.operationHistory'), url: '/dashboard/operations/history', icon: History },
    { title: t('nav.templates'), url: '/dashboard/operations/templates', icon: FileText },
    { title: t('nav.training'), url: '/dashboard/operations/training', icon: GraduationCap },
  ];

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const dark = document.documentElement.classList.contains('dark');
    setIsDark(dark);
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark(!isDark);
  };

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'cs' ? 'en' : 'cs');
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const userInitials = user.email?.substring(0, 2).toUpperCase() || 'U';

  const getCurrentPageTitle = () => {
    const allItems = [...testingItems, ...operationItems];
    const currentItem = allItems.find((item) => 
      item.url === '/dashboard' 
        ? location.pathname === '/dashboard' 
        : location.pathname.startsWith(item.url)
    );
    return currentItem?.title || t('nav.dashboard');
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <Sidebar className="border-r border-sidebar-border bg-sidebar">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <img src={pwcLogo} alt="PwC" className="h-10 w-auto rounded" />
              <div className="flex-1 min-w-0">
                <span className="font-bold text-sidebar-foreground text-sm">Browser Automation</span>
              </div>
            </div>
          </div>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/60">{t('nav.testing')}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {testingItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end={item.url === '/dashboard'}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        >
                          <item.icon className="w-5 h-5" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/60">{t('nav.operations')}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {operationItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        >
                          <item.icon className="w-5 h-5" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <div className="mt-auto p-4 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-start gap-3 h-auto py-2 text-sidebar-foreground hover:bg-sidebar-accent">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="gradient-primary text-primary-foreground text-xs">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium truncate">{user.email}</p>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={toggleLanguage}>
                  <Languages className="mr-2 h-4 w-4" />
                  {i18n.language === 'cs' ? t('language.en') : t('language.cs')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleTheme}>
                  {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                  {isDark ? t('theme.light') : t('theme.dark')}
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  {t('common.settings')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('auth.signOut')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Sidebar>

        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-6 py-4">
            <div className="flex items-center gap-4">
              <SidebarTrigger />
              <h1 className="text-lg font-semibold">{getCurrentPageTitle()}</h1>
            </div>
          </header>
          
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
