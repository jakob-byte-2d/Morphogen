import { t } from "./ui/strings";
import "./ui/style.css";

const app = document.getElementById("app")!;
const box = document.createElement("div");
box.className = "placeholder";
const text = document.createElement("p");
text.textContent = `${t.title} – ${t.comingSoon}`;
box.append(text);
app.append(box);
