import { Router } from "express";
import multer from "multer";
import { supabaseAdmin } from "../config/supabaseAdmin.js";
import { requireStaffAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { badRequest } from "../lib/errors.js";

export const uploadsRouter = Router();

const EXTENSION_POR_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ---------------------------------------------------------------------
// POST /uploads  (admin) — sube un archivo al bucket público "publico"
// de Supabase Storage y regresa su URL pública. Usado por Promociones
// (imagen/PDF) y Apariencia (logo, botón QR, tazas de progreso) — antes
// estos campos solo aceptaban pegar una ruta/URL a mano porque no había
// service role key conectada; ya se conectó (25 sep 2026).
// ---------------------------------------------------------------------
uploadsRouter.post(
  "/",
  requireStaffAuth,
  requireRole("admin"),
  upload.single("archivo"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest("Falta el archivo (campo 'archivo')");
    const extension = EXTENSION_POR_MIME[req.file.mimetype];
    if (!extension) throw badRequest(`Tipo de archivo no soportado: ${req.file.mimetype}`);

    const nombreArchivo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const { error } = await supabaseAdmin.storage.from("publico").upload(nombreArchivo, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false,
    });
    if (error) throw badRequest(`No se pudo subir el archivo: ${error.message}`);

    const { data } = supabaseAdmin.storage.from("publico").getPublicUrl(nombreArchivo);
    res.status(201).json({ url: data.publicUrl });
  })
);
