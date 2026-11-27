"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface NavItem {
  title: string;
  href: string;
}

export interface NavCategory {
  category: string;
  items: NavItem[];
}

export interface TocItem {
  label: string;
  href: string;
}

interface DocsLayoutProps {
  sidebarNav: NavCategory[];
  onThisPage: TocItem[];
  children: ReactNode;
}

export function DocsLayout({ sidebarNav, onThisPage, children }: DocsLayoutProps) {
  const [activeId, setActiveId] = useState<string>("welcome");

  // Track active section via IntersectionObserver & scroll listener
  useEffect(() => {
    const allIds = onThisPage
      .map((item) => item.href.replace("#", ""))
      .concat(
        sidebarNav.flatMap((cat) => cat.items.map((it) => it.href.replace("#", "")))
      );
    const uniqueIds = Array.from(new Set(allIds));

    const handleScroll = () => {
      const scrollPos = window.scrollY + 140; // 140px header offset
      let current = uniqueIds[0] || "welcome";

      for (const id of uniqueIds) {
        const el = document.getElementById(id);
        if (el) {
          const top = el.offsetTop;
          if (top <= scrollPos) {
            current = id;
          }
        }
      }
      setActiveId(current);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [sidebarNav, onThisPage]);

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith("#")) {
      e.preventDefault();
      const id = href.replace("#", "");
      setActiveId(id);
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.pushState(null, "", href);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Sidebar (3 Cols on lg): Hierarchical Navigation */}
      <aside className="lg:col-span-3 xl:col-span-3 hidden lg:block sticky top-28 self-start max-h-[calc(100vh-8rem)] overflow-y-auto no-scrollbar space-y-6 pr-4 border-r border-white/[0.06]">
        {sidebarNav.map((group) => (
          <div key={group.category} className="space-y-2">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e]/80 font-semibold px-2">
              {group.category}
            </div>
            <ul className="space-y-0.5 text-xs font-mono">
              {group.items.map((item) => {
                const targetId = item.href.replace("#", "");
                const isActive = activeId === targetId;
                return (
                  <li key={item.title}>
                    <a
                      href={item.href}
                      onClick={(e) => handleLinkClick(e, item.href)}
                      className={`block px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                        isActive
                          ? "bg-[#52b896]/15 text-[#52b896] font-semibold border-l-2 border-[#52b896]"
                          : "text-[#a3abb8] hover:text-[#f8f9fa] hover:bg-white/[0.04]"
                      }`}
                    >
                      {item.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </aside>

      {/* Center Main Content Area (6-7 Cols on lg/xl) */}
      <main className="lg:col-span-9 xl:col-span-6 min-w-0 space-y-14">
        {children}
      </main>

      {/* Right Sticky Sidebar (3 Cols on xl): On This Page Table of Contents */}
      <aside className="xl:col-span-3 hidden xl:block sticky top-28 self-start max-h-[calc(100vh-8rem)] overflow-y-auto no-scrollbar space-y-3 pl-6 border-l border-white/[0.06]">
        <div className="text-[11px] font-mono uppercase tracking-wider text-[#8b929e] font-semibold">
          On this page
        </div>
        <ul className="space-y-1.5 text-xs font-mono">
          {onThisPage.map((item) => {
            const targetId = item.href.replace("#", "");
            const isActive = activeId === targetId;
            return (
              <li key={item.label}>
                <a
                  href={item.href}
                  onClick={(e) => handleLinkClick(e, item.href)}
                  className={`block py-1 transition-colors cursor-pointer ${
                    isActive
                      ? "text-[#52b896] font-semibold translate-x-1"
                      : "text-[#a3abb8] hover:text-[#f8f9fa]"
                  }`}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
