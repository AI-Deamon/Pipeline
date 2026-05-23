import React from 'react';
interface TableOfContentsProps {
  sections: string[];
  currentSection: string;
  onSectionClick: (section: string) => void;
}
const TableOfContents: React.FC<TableOfContentsProps> = ({ sections, currentSection, onSectionClick }) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-4">Table of Contents</h3>
      <nav>
        <ul className="space-y-2">
          {sections.map((section) => (
            <li key={section}>
              <button
                onClick={() => onSectionClick(section)}
                className={`text-left w-full px-3 py-2 rounded-lg transition-colors ${
                  currentSection === section
                    ? 'bg-slate-900 text-white'
                    : 'hover:bg-slate-100 text-slate-700'
                }`}
              >
                {section}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};
export default TableOfContents;
