import { Router } from "express";
import { requirePermission } from "../middlewares/permissionsMiddleware";
import { getLinkPreview, parsePublicUrl } from "../utils/linkPreview";

const router = Router();

router.get("/", requirePermission("modifyDocument"), async (req, res) => {
  const url = req.query.url;
  if (typeof url !== "string") { res.status(400).json({ message: "Un lien est requis." }); return; }
  try { parsePublicUrl(url); } catch { res.status(400).json({ message: "Lien public HTTP ou HTTPS invalide." }); return; }
  try {
    res.json(await getLinkPreview(url));
  } catch {
    res.status(422).json({ message: "L’aperçu de cette page n’est pas disponible." });
  }
});

export default router;
