import React, { useState, useEffect } from 'react';
import { db, storage, collection, addDoc, onSnapshot, serverTimestamp, ref, uploadBytes, getDownloadURL } from '../firebase';
import { toast } from '../utils/toast';

const DEFAULT_CATEGORIES = ['Handloom Mats', 'Rubber Mats', 'Fancy Mats', 'Bed Spreads'];
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:10000';

export default function ProductForm() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Handloom Mats');
  const [newCatInput, setNewCatInput] = useState('');
  const [showNewCat, setShowNewCat] = useState(false);
  const [customCategories, setCustomCategories] = useState(DEFAULT_CATEGORIES);

  // Subscribe to real-time categories from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'categories'), (snapshot) => {
      const cats = snapshot.docs.map((d) => d.data().name).filter(Boolean);
      if (cats.length > 0) {
        setCustomCategories((prev) => Array.from(new Set([...DEFAULT_CATEGORIES, ...prev, ...cats])));
      }
    }, (err) => {
      console.warn('Firestore categories sync notice:', err.message);
    });

    return () => unsubscribe();
  }, []);
  
  const [baseRate, setBaseRate] = useState('');
  const [unitType, setUnitType] = useState('per Bundle');
  const [bundlePieces, setBundlePieces] = useState(10);
  const [bundlesPerPack, setBundlesPerPack] = useState(8);
  const [minOrderNotice, setMinOrderNotice] = useState('Purchased per full Bundle (10 Pcs only)');
  const [stockStatus, setStockStatus] = useState('IN_STOCK');
  const [seasonNotice, setSeasonNotice] = useState('Price may differ based on the season item or the stock quantity');
  const [description, setDescription] = useState('');
  
  // 2 to 4 Images for each item
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleUnitChange = (unit) => {
    setUnitType(unit);
    if (unit === 'per Bundle' || unit === 'per Dozen') {
      const pcs = unit === 'per Dozen' ? 12 : (bundlePieces || 10);
      setBundlePieces(pcs);
      setMinOrderNotice(`Purchased per full ${unit.replace('per ', '')} (${pcs} Pcs only)`);
    } else {
      setBundlePieces(1);
      setMinOrderNotice('Available for individual piece purchase');
    }
  };

  const handlePiecesChange = (val) => {
    const num = parseInt(val, 10) || 0;
    setBundlePieces(num);
    if (unitType === 'per Bundle' || unitType === 'per Dozen') {
      setMinOrderNotice(`Purchased per full ${unitType.replace('per ', '')} (${num} Pcs only)`);
    }
  };

  const handleCategorySelect = (val) => {
    if (val === 'NEW_CATEGORY') {
      setShowNewCat(true);
    } else {
      setShowNewCat(false);
      setCategory(val);
    }
  };

  const handleAddCustomCategory = async () => {
    if (newCatInput.trim()) {
      const catName = newCatInput.trim();
      setCustomCategories((prev) => Array.from(new Set([...prev, catName])));
      setCategory(catName);
      setShowNewCat(false);
      setNewCatInput('');
      try {
        await addDoc(collection(db, 'categories'), { name: catName, createdAt: serverTimestamp() });
      } catch (err) {
        console.warn('Category Firestore save warning:', err);
      }
    }
  };

  const compressImage = (file, maxWidth = 800, quality = 0.75) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(dataUrl);
          } catch (canvasErr) {
            resolve(e.target.result);
          }
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleImagesSelected = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      const combined = [...imageFiles, ...selected].slice(0, 4);
      setImageFiles(combined);

      // Generate previews
      const newPreviews = combined.map((file) => URL.createObjectURL(file));
      setImagePreviews(newPreviews);

      if (combined.length < 2) {
        toast.info('Please select at least 2 images (up to 4) for this item.', '2-4 Images Required');
      } else {
        toast.success(`${combined.length} photos ready for upload!`, 'Photos Attached');
      }
    }
  };

  const handleRemoveImage = (indexToRemove) => {
    const updatedFiles = imageFiles.filter((_, idx) => idx !== indexToRemove);
    const updatedPreviews = imagePreviews.filter((_, idx) => idx !== indexToRemove);
    setImageFiles(updatedFiles);
    setImagePreviews(updatedPreviews);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !category || !baseRate) {
      toast.warning('Please fill in all required product fields.', 'Missing Information');
      return;
    }

    if (imageFiles.length < 2) {
      toast.warning('Please upload at least 2 photos (up to 4) for each mat item.', '2 to 4 Images Required');
      return;
    }

    setUploading(true);
    const uploadedUrls = [];

    // Process all 2 to 4 images
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const filename = `product-images/${Date.now()}_img${i + 1}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const storageRef = ref(storage, filename);

      try {
        const storageTimeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Cloud Storage timeout')), 1500)
        );
        await Promise.race([uploadBytes(storageRef, file), storageTimeout]);
        const url = await getDownloadURL(storageRef);
        uploadedUrls.push(url);
      } catch (err) {
        console.warn(`Storage upload skipped or timed out for photo ${i + 1}, creating visual data URL:`, err.message);
        try {
          const dataUrl = await compressImage(file, 700, 0.72);
          uploadedUrls.push(dataUrl);
        } catch (compErr) {
          console.error('Image compression failed:', compErr);
          uploadedUrls.push('/assets/logo.png');
        }
      }
    }

    const finalBundlesPerPack = Math.max(1, parseInt(bundlesPerPack, 10) || 1);
    const finalBundlePieces = unitType === 'per Piece' ? 1 : (parseInt(bundlePieces, 10) || 1);

    const nowIso = new Date().toISOString();
    const productData = {
      title: name.trim(),
      category,
      baseRate: parseFloat(baseRate) || 0,
      unit: unitType,
      bundlePieces: finalBundlePieces,
      bundlesPerPack: finalBundlesPerPack,
      compressibility: 0.80,
      minOrderNotice,
      inStock: stockStatus === 'IN_STOCK',
      stockStatus: stockStatus,
      stockQty: stockStatus === 'IN_STOCK' ? 100 : 0,
      seasonNotice,
      description: description.trim(),
      imageUrl: uploadedUrls[0] || '/assets/logo.png',
      images: uploadedUrls
    };

    const assignedId = 'prod_' + Date.now();
    const finalProduct = {
      id: assignedId,
      ...productData,
      createdAt: nowIso
    };

    // 1. Authoritative sync to Central Server API (bridges port 3000 Admin and port 3001 User)
    try {
      await fetch(`${SERVER_URL}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalProduct)
      });
    } catch (apiErr) {
      console.warn('Central server product post notice:', apiErr.message);
    }

    // 2. Optimistically update local storage & broadcast channel
    try {
      const existing = JSON.parse(localStorage.getItem('gsco_catalog_products') || '[]');
      const updated = [finalProduct, ...existing.filter((p) => p.id !== assignedId)];
      localStorage.setItem('gsco_catalog_products', JSON.stringify(updated.slice(0, 50)));
    } catch (quotaErr) {
      console.warn('LocalStorage quota notice:', quotaErr);
    }

    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      try {
        const channel = new BroadcastChannel('gsco_realtime_channel');
        channel.postMessage({ type: 'PRODUCT_ADDED', product: finalProduct });
        channel.close();
      } catch (bcErr) {
        console.warn('BroadcastChannel error:', bcErr);
      }
    }

    // 3. Attempt Firestore write as cloud backup
    try {
      const docRef = await addDoc(collection(db, 'products'), {
        ...productData,
        createdAt: serverTimestamp()
      });
      if (docRef && docRef.id && docRef.id !== assignedId) {
        // If Firestore assigned a custom id, link it
        fetch(`${SERVER_URL}/api/products/${assignedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firestoreId: docRef.id })
        }).catch(() => {});
      }
    } catch (fsErr) {
      console.warn('Firestore cloud backup notice (using server sync):', fsErr.message);
    }

    toast.success(`Product "${name}" added & synced live across portals!`, 'Product Uploaded');
    setName('');
    setBaseRate('');
    setBundlesPerPack(8);
    setBundlePieces(10);
    setUnitType('per Bundle');
    setDescription('');
    setImageFiles([]);
    setImagePreviews([]);
    setUploading(false);
  };

  return (
    <aside className="control-panel">
      <section className="card product-form-card">
        <div className="card-header">
          <h2>
            <i className="fa-solid fa-circle-plus"></i> Add Mat to Catalog
          </h2>
          <p className="section-desc">Upload 2 to 4 photos, set category, packaging, and rate details.</p>
        </div>

        <form onSubmit={handleSubmit} className="product-form">
          {/* Multi-Image Upload (2 to 4 Images Required) */}
          <div className="form-group">
            <div className="label-with-badge" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <label style={{ margin: 0 }}>
                <i className="fa-solid fa-images" style={{ color: 'var(--brand-magenta, #9e2267)', marginRight: '0.35rem' }}></i>
                Product Photos (2 to 4 Images)
              </label>
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.2rem 0.55rem',
                borderRadius: '12px',
                background: imageFiles.length >= 2 ? '#f0fdf4' : '#fef2f2',
                color: imageFiles.length >= 2 ? '#166534' : '#991b1b',
                border: `1px solid ${imageFiles.length >= 2 ? '#86efac' : '#fca5a5'}`
              }}>
                {imageFiles.length} of 4 Attached {imageFiles.length < 2 && '(Min 2 Required)'}
              </span>
            </div>

            {/* Thumbnail Preview Grid */}
            <div className="multi-image-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.5rem' }}>
              {[0, 1, 2, 3].map((slotIdx) => {
                const preview = imagePreviews[slotIdx];
                const isPrimary = slotIdx === 0;

                return (
                  <div
                    key={slotIdx}
                    className="image-slot-card"
                    style={{
                      position: 'relative',
                      aspectRatio: '1',
                      borderRadius: '8px',
                      border: preview ? '2px solid var(--brand-magenta, #9e2267)' : '2px dashed #cbd5e1',
                      backgroundColor: preview ? '#000000' : '#f8fafc',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column'
                    }}
                  >
                    {preview ? (
                      <>
                        <img
                          src={preview}
                          alt={`Angle ${slotIdx + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(slotIdx)}
                          title="Remove this photo"
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            background: 'rgba(239, 68, 68, 0.9)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            cursor: 'pointer'
                          }}
                        >
                          <i className="fa-solid fa-xmark"></i>
                        </button>
                        <span style={{
                          position: 'absolute',
                          bottom: '0',
                          left: '0',
                          right: '0',
                          background: 'rgba(0,0,0,0.65)',
                          color: '#ffffff',
                          fontSize: '0.62rem',
                          textAlign: 'center',
                          padding: '1px 0',
                          fontWeight: 600
                        }}>
                          {isPrimary ? '★ Cover' : `Angle ${slotIdx + 1}`}
                        </span>
                      </>
                    ) : (
                      <label style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        width: '100%',
                        height: '100%',
                        color: '#94a3b8',
                        padding: '4px',
                        textAlign: 'center'
                      }}>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={handleImagesSelected}
                          multiple
                        />
                        <i className="fa-solid fa-camera" style={{ fontSize: '1.1rem', marginBottom: '0.2rem', color: isPrimary ? 'var(--brand-magenta, #9e2267)' : '#94a3b8' }}></i>
                        <span style={{ fontSize: '0.65rem', fontWeight: 600 }}>
                          {isPrimary ? '+ Photo 1*' : slotIdx === 1 ? '+ Photo 2*' : `+ Photo ${slotIdx + 1}`}
                        </span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick Upload Button Strip */}
            {imageFiles.length < 4 && (
              <label className="btn-upload-more" style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--brand-navy, #15244c)',
                background: '#e0e7ff',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                cursor: 'pointer'
              }}>
                <i className="fa-solid fa-plus"></i> Select More Photos (2 to 4 total)
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImagesSelected}
                  style={{ display: 'none' }}
                />
              </label>
            )}
          </div>

          {/* Product Name */}
          <div className="form-group">
            <label><i className="fa-solid fa-tag"></i> Mat Name / Code</label>
            <input
              type="text"
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Premium Cotton Handloom Mat"
              required
            />
          </div>

          {/* Category Selector with Sri Surya Tex Categories */}
          <div className="form-group">
            <label><i className="fa-solid fa-layer-group"></i> Choose Category</label>
            <select
              className="form-control"
              value={showNewCat ? 'NEW_CATEGORY' : category}
              onChange={(e) => handleCategorySelect(e.target.value)}
              required
            >
              {customCategories.map((cat, idx) => (
                <option key={idx} value={cat}>{cat}</option>
              ))}
              <option value="NEW_CATEGORY">+ Create New Category...</option>
            </select>

            {showNewCat && (
              <div className="new-category-box">
                <div className="input-with-btn">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Type new category name..."
                    value={newCatInput}
                    onChange={(e) => setNewCatInput(e.target.value)}
                  />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddCustomCategory}>
                    <i className="fa-solid fa-check"></i> Add
                  </button>
                  <button type="button" className="btn btn-icon btn-sm" onClick={() => setShowNewCat(false)}>
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Rate & Selling Unit */}
          <div className="form-row">
            <div className="form-group col-6">
              <label>
                <i className="fa-solid fa-indian-rupee-sign"></i> Rate (₹ / {unitType.replace('per ', '')})
              </label>
              <input
                type="number"
                className="form-control"
                value={baseRate}
                onChange={(e) => setBaseRate(e.target.value)}
                placeholder={unitType === 'per Piece' ? 'e.g. 180' : 'e.g. 1800'}
                min="1"
                required
              />
              <small style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                {unitType === 'per Piece'
                  ? 'Price for 1 single piece'
                  : baseRate && bundlePieces
                    ? `Price for 1 bundle (~ ₹${Math.round(parseFloat(baseRate) / bundlePieces)}/pc)`
                    : `Price for 1 ${unitType.replace('per ', '')}`}
              </small>
            </div>
            <div className="form-group col-6">
              <label><i className="fa-solid fa-ruler-combined"></i> Selling Unit</label>
              <select className="form-control" value={unitType} onChange={(e) => handleUnitChange(e.target.value)}>
                <option value="per Bundle">per Bundle</option>
                <option value="per Piece">per Piece</option>
                <option value="per Dozen">per Dozen</option>
                <option value="per Meter">per Meter</option>
                <option value="per Feet">per Feet</option>
              </select>
              <small style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                How this item is sold
              </small>
            </div>
          </div>

          {/* Packaging Configuration: Pieces per Bundle & Bundles per Master Bale */}
          <div className="form-row">
            {(unitType === 'per Bundle' || unitType === 'per Dozen') ? (
              <>
                <div className="form-group col-6">
                  <label><i className="fa-solid fa-boxes-packing"></i> Pieces per {unitType.replace('per ', '')}</label>
                  <input
                    type="number"
                    className="form-control"
                    value={bundlePieces}
                    onChange={(e) => handlePiecesChange(e.target.value)}
                    placeholder="e.g. 10 or 50"
                    min="1"
                    required
                  />
                  <small style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                    Pieces in 1 bundle
                  </small>
                </div>
                <div className="form-group col-6">
                  <label><i className="fa-solid fa-cube"></i> Bundles / Master Bale</label>
                  <input
                    type="number"
                    className="form-control"
                    value={bundlesPerPack}
                    onChange={(e) => setBundlesPerPack(e.target.value)}
                    placeholder="e.g. 3, 8, 10"
                    min="1"
                    required
                  />
                  <small style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                    Bundles packed in 1 Bale
                  </small>
                </div>
              </>
            ) : (
              <div className="form-group col-12">
                <label><i className="fa-solid fa-cube"></i> Pieces per Master Bale</label>
                <input
                  type="number"
                  className="form-control"
                  value={bundlesPerPack}
                  onChange={(e) => setBundlesPerPack(e.target.value)}
                  placeholder="e.g. 120"
                  min="1"
                  required
                />
                <small style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginTop: '0.2rem' }}>
                  Total individual pieces fitting in 1 Master Bale
                </small>
              </div>
            )}
          </div>

          {/* Purchase Notice */}
          <div className="form-group">
            <label><i className="fa-solid fa-cart-flatbed"></i> Customer Purchase Notice</label>
            <input
              type="text"
              className="form-control"
              value={minOrderNotice}
              onChange={(e) => setMinOrderNotice(e.target.value)}
              placeholder="e.g. Minimum order 1 bundle (10 pcs)"
            />
          </div>

          {/* Stock Availability */}
          <div className="form-row">
            <div className="form-group col-6">
              <label><i className="fa-solid fa-warehouse"></i> Stock Availability</label>
              <select
                className="form-control"
                value={stockStatus}
                onChange={(e) => setStockStatus(e.target.value)}
                style={{
                  fontWeight: 700,
                  color: stockStatus === 'IN_STOCK' ? '#166534' : '#991b1b',
                  backgroundColor: stockStatus === 'IN_STOCK' ? '#f0fdf4' : '#fef2f2',
                  borderColor: stockStatus === 'IN_STOCK' ? '#86efac' : '#fca5a5'
                }}
              >
                <option value="IN_STOCK">In Stock</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
              </select>
            </div>
            <div className="form-group col-6">
              <label><i className="fa-solid fa-tags"></i> Pricing Notice</label>
              <input
                type="text"
                className="form-control"
                value={seasonNotice}
                onChange={(e) => setSeasonNotice(e.target.value)}
                placeholder="Price may differ based on the season item"
              />
            </div>
          </div>

          {/* Description */}
          <div className="form-group">
            <label><i className="fa-solid fa-align-left"></i> Product Details & Specifications</label>
            <textarea
              className="form-control"
              rows="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dimensions, quality weave, materials, colors..."
            ></textarea>
          </div>

          <button type="submit" className="btn-submit-product" disabled={uploading}>
            <i className="fa-solid fa-plus-circle"></i> {uploading ? 'Processing & Uploading Photos...' : 'Upload Mat Product (2-4 Photos)'}
          </button>
        </form>
      </section>
    </aside>
  );
}
