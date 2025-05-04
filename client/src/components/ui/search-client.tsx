// Reusable SearchClient component
import React, { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { PersonInfo } from "@shared/schema";

interface SearchClientProps {
  onSelect: (client: PersonInfo) => void;
  minLength?: number;
  placeholder?: string;
  className?: string;
}

export const SearchClient: React.FC<SearchClientProps> = ({
  onSelect,
  minLength = 4,
  placeholder = "Search Client (enter minimum 4 characters)",
  className = "",
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Fetch all clients
  const { data: clients = [] } = useQuery<PersonInfo[]>({
    queryKey: ["/api/person-info"],
    staleTime: 10000,
  });

  // Filter clients based on search term
  const filteredClients =
    searchTerm.length >= minLength
      ? clients.filter((client) =>
          `${client.firstName} ${client.lastName}`
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
        )
      : [];

  // Handle click outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className={`relative w-full ${className}`} ref={searchRef}>
      <Input
        type="text"
        placeholder={placeholder}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        onFocus={() => {
          if (filteredClients.length > 0) setShowDropdown(true);
        }}
        autoComplete="off"
      />
      {showDropdown && filteredClients.length > 0 && (
        <div className="absolute w-full mt-1 bg-white border rounded-md shadow-lg z-10 max-h-60 overflow-y-auto">
          {filteredClients.map((client) => (
            <div
              key={client.id}
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
              onClick={() => {
                onSelect(client);
                setSearchTerm(`${client.firstName} ${client.lastName}`);
                setShowDropdown(false);
              }}
            >
              {client.title ? client.title + " " : ""}
              {client.firstName} {client.lastName}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
