import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
  Unsubscribe,
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { db, storage } from "./config";
import type {
  InventoryItem,
  GoldKarat,
  ItemCategory,
  ItemStatus,
  WeightUnit,
  CurrencyCode,
} from "@/types";

// ─── Extended input type (net_weight is gold-shop–specific) ──────────────────

export interface NewInventoryItemInput {
  name_ar:                string;
  name:                   string;
  category:               ItemCategory;
  karat:                  GoldKarat;
  weight:                 number;   // gross weight
  net_weight:             number;   // pure gold weight after deducting stones/alloy
  weight_unit:            WeightUnit;
  making_charge:          number;
  making_charge_per_gram?: number;
  cost_price:             number;
  selling_price:          number;
  currency:               CurrencyCode;
  supplier_id?:           string;
  description?:           string;
  notes?:                 string;
}

export interface InventoryListOptions {
  tenantId:    string;
  status?:     ItemStatus;
  karat?:      GoldKarat;
  category?:   ItemCategory;
  pageSize?:   number;
  after?:      QueryDocumentSnapshot<DocumentData>;
}

export type UploadProgressCallback = (pct: number) => void;

// ─── SKU generator ────────────────────────────────────────────────────────────

function generateSKU(karat: GoldKarat, category: ItemCategory): string {
  const k  = `K${karat}`;
  const c  = category.slice(0, 3).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  const rn = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${k}-${c}-${ts}${rn}`;
}

// ─── Image upload ─────────────────────────────────────────────────────────────

export async function uploadInventoryImage(
  tenantId:   string,
  itemId:     string,
  file:       File,
  onProgress?: UploadProgressCallback
): Promise<string> {
  const ext      = file.name.split(".").pop() ?? "jpg";
  const path     = `tenants/${tenantId}/inventory/${itemId}/${Date.now()}.${ext}`;
  const storeRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storeRef, file, { contentType: file.type });

    task.on(
      "state_changed",
      (snap) => onProgress?.((snap.bytesTransferred / snap.totalBytes) * 100),
      reject,
      async () => resolve(await getDownloadURL(task.snapshot.ref))
    );
  });
}

export async function deleteInventoryImage(url: string): Promise<void> {
  try {
    await deleteObject(ref(storage, url));
  } catch {
    // File may already be gone; non-fatal.
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function addInventoryItem(
  tenantId:    string,
  input:       NewInventoryItemInput,
  imageFiles:  File[],
  onProgress?: UploadProgressCallback
): Promise<InventoryItem & { net_weight: number }> {
  const sku    = generateSKU(input.karat, input.category);
  const colRef = collection(db, "tenants", tenantId, "inventory");

  // Write the document first — we need its ID for the Storage path.
  const docRef = await addDoc(colRef, {
    ...input,
    tenant_id:  tenantId,
    sku,
    status:     "available" as ItemStatus,
    images:     [] as string[],
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  // Upload images sequentially; spread overall progress across all files.
  const imageUrls: string[] = [];
  for (let i = 0; i < imageFiles.length; i++) {
    const url = await uploadInventoryImage(
      tenantId,
      docRef.id,
      imageFiles[i],
      (filePct) => {
        onProgress?.(((i + filePct / 100) / imageFiles.length) * 100);
      }
    );
    imageUrls.push(url);
  }

  if (imageUrls.length > 0) {
    await updateDoc(docRef, { images: imageUrls, updated_at: serverTimestamp() });
  }

  onProgress?.(100);

  const now = Timestamp.now();
  return {
    id:          docRef.id,
    tenant_id:   tenantId,
    sku,
    status:      "available",
    images:      imageUrls,
    created_at:  now,
    updated_at:  now,
    ...input,
  };
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateInventoryItem(
  tenantId: string,
  itemId:   string,
  patch:    Partial<NewInventoryItemInput & { status: ItemStatus }>
): Promise<void> {
  await updateDoc(
    doc(db, "tenants", tenantId, "inventory", itemId),
    { ...patch, updated_at: serverTimestamp() }
  );
}

// ─── Read — one-time fetch with filters ──────────────────────────────────────

export async function fetchInventoryPage(opts: InventoryListOptions): Promise<{
  items:    (InventoryItem & { net_weight: number })[];
  lastDoc:  QueryDocumentSnapshot<DocumentData> | null;
}> {
  const {
    tenantId,
    status,
    karat,
    category,
    pageSize = 40,
    after,
  } = opts;

  const constraints: Parameters<typeof query>[1][] = [
    orderBy("created_at", "desc"),
    limit(pageSize),
  ];

  if (status)   constraints.unshift(where("status",   "==", status));
  if (karat)    constraints.unshift(where("karat",    "==", karat));
  if (category) constraints.unshift(where("category", "==", category));
  if (after)    constraints.push(startAfter(after));

  const q      = query(collection(db, "tenants", tenantId, "inventory"), ...constraints);
  const snap   = await getDocs(q);
  const lastDoc = snap.docs.at(-1) ?? null;

  const items = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<InventoryItem, "id"> & { net_weight: number }) })
  );

  return { items, lastDoc };
}

// ─── Read — real-time subscription ───────────────────────────────────────────

export function subscribeToInventory(
  tenantId: string,
  onUpdate: (items: (InventoryItem & { net_weight: number })[]) => void,
  opts?: Pick<InventoryListOptions, "status" | "karat" | "category">
): Unsubscribe {
  const constraints: Parameters<typeof query>[1][] = [
    orderBy("created_at", "desc"),
    limit(200),
  ];

  if (opts?.status)   constraints.unshift(where("status",   "==", opts.status));
  if (opts?.karat)    constraints.unshift(where("karat",    "==", opts.karat));
  if (opts?.category) constraints.unshift(where("category", "==", opts.category));

  const q = query(collection(db, "tenants", tenantId, "inventory"), ...constraints);

  return onSnapshot(q, (snap) => {
    onUpdate(
      snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<InventoryItem, "id"> & { net_weight: number }) })
      )
    );
  });
}
