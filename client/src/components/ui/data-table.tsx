import { useState } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  getFilteredRowModel,
  ColumnFiltersState,
  SortingState,
} from "@tanstack/react-table";
import { Input } from "./input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Button } from "./button";

interface DataTableProps<T extends object> {
  data: T[];
  columns: ColumnDef<T>[];
  searchPlaceholder?: string;
  searchColumn?: string;
}

export type DataTableColumnDef<T extends object> = ColumnDef<T>;

export function DataTable<T extends object>({
  data,
  columns,
  searchPlaceholder = "Search...",
  searchColumn,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
    },
  });

  return (
    <div>
      <div className="flex items-center py-4">
        <Input
          placeholder={searchPlaceholder}
          value={(table.getColumn(getSearchColumnId(columns, searchColumn))?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn(getSearchColumnId(columns, searchColumn))?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
      </div>
      
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead 
                    key={header.id}
                    className="cursor-pointer"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                    {{ asc: ' 🔼', desc: ' 🔽' }[header.column.getIsSorted() as string] ?? null}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

// Helper function to get a valid search column ID
function getSearchColumnId<T extends object>(columns: ColumnDef<T>[], searchColumn?: string): string {
  // If searchColumn is provided and exists in the table, use it
  if (searchColumn) return searchColumn;
  
  // Otherwise find the first column with an ID
  for (const column of columns) {
    if (column.id) return column.id;
    // If the column has an accessorKey, it will be used as the ID by TanStack Table
    if (typeof column.accessorKey === 'string') return column.accessorKey;
  }
  
  // Fallback to a safe default if no valid ID is found
  return columns.length > 0 ? 
    // For an accessorFn column, TanStack will auto-generate an ID
    (columns[0].id || String(columns[0].accessorKey) || "id") : 
    "id";
}