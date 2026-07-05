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
      { label: "Invoices", href: "/invoices", icon: "invoices" },
      { label: "New invoice", href: "/invoices/new", icon: "plus" },
    ],
  },
  {
    label: "Records",
    items: [
      { label: "Customers", href: "/customers", icon: "customers" },
      { label: "Services", href: "/services", icon: "services" },
    ],
  },
  {
    label: "Administration",
    adminOnly: true,
    items: [
      { label: "Users", href: "/admin/users", icon: "users", adminOnly: true },
      { label: "Exports", href: "/admin/exports", icon: "invoices", adminOnly: true },
      { label: "Settings", href: "/admin/settings", icon: "settings", adminOnly: true },
    ],
  },
];
