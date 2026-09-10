import React from "react";
import { createRoot } from "react-dom/client";
import "./storage-shim.js";        // must run before the component mounts
import RecipeBox from "./RecipeBox.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RecipeBox />
  </React.StrictMode>
);
