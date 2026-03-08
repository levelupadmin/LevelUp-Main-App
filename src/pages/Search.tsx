import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { Search as SearchIcon } from "lucide-react";

const Search = () => (
  <AppShell>
    <PlaceholderPage
      icon={SearchIcon}
      title="Search"
      subtitle="Search courses, creators, community posts, and opportunities."
    />
  </AppShell>
);

export default Search;
