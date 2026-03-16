"use client";

import { useState, useMemo } from "react";
import { HiChevronUp, HiChevronDown, HiSearch } from "react-icons/hi";

interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns, data, searchable = false, searchPlaceholder = "Buscar...",
  emptyMessage = "No hay datos para mostrar", onRowClick,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");

  const filteredData = useMemo(() => {
    let result = [...data];
    if (search) {
      const term = search.toLowerCase();
      result = result.filter((item) =>
        Object.values(item).some((val) => String(val).toLowerCase().includes(term))
      );
    }
    if (sortKey) {
      result.sort((a, b) => {
        const aVal = a[sortKey]; const bVal = b[sortKey];
        if (aVal == null) return 1; if (bVal == null) return -1;
        const comparison = typeof aVal === "number" && typeof bVal === "number"
          ? aVal - bVal : String(aVal).localeCompare(String(bVal));
        return sortDir === "asc" ? comparison : -comparison;
      });
    }
    return result;
  }, [data, search, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) { setSortDir(sortDir === "asc" ? "desc" : "asc"); }
    else { setSortKey(key); setSortDir("asc"); }
  };

  return (
    <div className="card p-0 overflow-hidden">
      {searchable && (
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder} className="input-field pl-10" />
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map((col) => (
                <th key={col.key}
                  className={`px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${col.sortable ? "cursor-pointer select-none hover:text-gray-700" : ""} ${col.className || ""}`}
                  onClick={() => col.sortable && handleSort(col.key)}>
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (sortDir === "asc" ? <HiChevronUp className="h-4 w-4" /> : <HiChevronDown className="h-4 w-4" />)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredData.length === 0 ? (
              <tr><td colSpan={columns.length} className="px-6 py-12 text-center text-gray-500">{emptyMessage}</td></tr>
            ) : (
              filteredData.map((item, idx) => (
                <tr key={idx} className={`hover:bg-gray-50 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
                  onClick={() => onRowClick?.(item)}>
                  {columns.map((col) => (
                    <td key={col.key} className={`px-6 py-4 text-sm text-gray-700 whitespace-nowrap ${col.className || ""}`}>
                      {col.render ? col.render(item) : String(item[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
