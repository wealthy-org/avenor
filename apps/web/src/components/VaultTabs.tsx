"use client";

import { useState, type ReactNode } from "react";

export interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
  content: ReactNode;
}

export function VaultTabs({ tabs, defaultTab }: { tabs: TabItem[]; defaultTab?: string }) {
  const [activeTab, setActiveTab] = useState<string>(defaultTab || (tabs[0]?.id ?? ""));

  return (
    <div className="space-y-6">
      {/* Tab Navigation Pill Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-white/[0.08]">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                isActive
                  ? "bg-[#6db89b]/15 text-[#6db89b] border border-[#6db89b]/40 shadow-[0_0_16px_rgba(109,184,155,0.12)] font-semibold"
                  : "text-[#a3abb8] hover:text-[#f8f9fa] hover:bg-white/[0.05] border border-transparent"
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`text-[11px] font-mono px-1.5 py-0.5 rounded-md ${
                    isActive ? "bg-[#6db89b]/25 text-[#6db89b]" : "bg-white/[0.06] text-[#8fa198]"
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Tab Panel */}
      <div className="min-h-[300px]">
        {tabs.find((tab) => tab.id === activeTab)?.content}
      </div>
    </div>
  );
}
