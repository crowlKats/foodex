import { define } from "../utils.ts";
import { Nav } from "../components/Nav.tsx";

export default define.page(function App({ Component }) {
  return (
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Foodex</title>
      </head>
      <body class="bg-gray-50 min-h-screen">
        <Nav />
        <main class="max-w-6xl mx-auto px-4 py-6">
          <Component />
        </main>
      </body>
    </html>
  );
});
