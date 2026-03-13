export function Nav() {
  return (
    <nav class="bg-gray-800 text-white">
      <div class="max-w-6xl mx-auto px-4 py-3 flex items-center gap-6">
        <a href="/" class="text-lg font-bold hover:text-green-400">
          Foodex
        </a>
        <a href="/recipes" class="hover:text-green-400">Recipes</a>
        <a href="/groceries" class="hover:text-green-400">Groceries</a>
        <a href="/stores" class="hover:text-green-400">Stores</a>
        <a href="/devices" class="hover:text-green-400">Devices</a>
      </div>
    </nav>
  );
}
