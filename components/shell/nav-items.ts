// Single source of truth for the sidebar (task 2.3). Structure mirrors the
// approved prototype: Ledger / Records / Administration sections, admin-only
// items tagged ADM. Items whose pages arrive in later phases carry `task`
// and render as inert placeholders — never dead links.

export type NavItem = {
  label: string;
  href: string;
  icon: "dashboard" | "invoices" | "plus" | "customers" | "services" | "users" | "settings";
  adminOnly?: boolean;
  /** BUILD_PHASES task that delivers this page; undefined = live now. */
  task?: string;
};

export type NavSection = { label: string; adminOnly?: boolean; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Ledger",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
      { label: "Invoices", href: "/invoices", icon: "invoices", task: "4.3" },
      { label: "New invoice", href: "/invoices/new", icon: "plus", task: "4.1" },
    ],
  },
  {
    label: "Records",
    items: [
      { label: "Customers", href: "/customers", icon: "customers", task: "3.1" },
      { label: "Services", href: "/services", icon: "services", task: "3.3" },
    ],
  },
  {
    label: "Administration",
    adminOnly: true,
    items: [
      { label: "Users", href: "/admin/users", icon: "users", adminOnly: true },
      { label: "Settings", href: "/admin/settings", icon: "settings", adminOnly: true, task: "3.2" },
    ],
  },
];
