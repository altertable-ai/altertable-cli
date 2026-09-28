import { createRoot } from "react-dom/client";
import { createThemeController } from "@altertable/data-app-runtime/appearance";
import { AppLayout, AboutData, PlayStory, ThemeToggle } from "@altertable/data-app-runtime/ui";
const theme = createThemeController({ mode: "light" });
const dataContext = {
  description: "A fixture exploring completed orders.",
  glossary: { orders: { term: "Orders", definition: "Completed customer orders." } },
};
createRoot(document.getElementById("root")!).render(
  <AppLayout footerActions={<ThemeToggle theme={theme} />}>
    <AboutData dataContext={dataContext} />
    <PlayStory
      title="Orders exploration"
      dataContext={dataContext}
      theme={theme}
      steps={[
        {
          id: "orders",
          headline: "Orders increased",
          visual: <p>120 orders</p>,
          glossaryIds: ["orders"],
        },
        { id: "customers", headline: "More returning customers", visual: <p>80 customers</p> },
      ]}
    />
  </AppLayout>,
);
