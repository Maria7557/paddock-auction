"use client";

type TabOption = {
  id: string;
  label: string;
};

type FilterTabsProps = {
  tabs: TabOption[];
  value: string;
  onChange: (next: string) => void;
};

export function FilterTabs({ tabs, value, onChange }: FilterTabsProps) {
  return (
    <div className="inline-actions" role="tablist" aria-label="Filters">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={tab.id === value ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
          onClick={() => onChange(tab.id)}
          role="tab"
          aria-selected={tab.id === value}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
