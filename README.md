# SRI SURYA TEX — Owner & Administrative Management Portal

[![Portal](https://img.shields.io/badge/Portal-Owner%20Management-15244c?style=for-the-badge)](http://localhost:3000)
[![React](https://img.shields.io/badge/React-18.x-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.x-purple?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-v10-orange?style=for-the-badge&logo=firebase)](https://firebase.google.com/)

The official operations, catalog administration, inventory control, and dispatch management portal for **SRI SURYA TEX** (Erode, Tamil Nadu).

---

## 🏢 Business Context

- **Entity**: SRI SURYA TEX
- **Proprietor**: P. MYILSAMY
- **Contact / Mobile**: +91 98426 86264
- **GSTIN**: `33DBQPM1973N1ZY`
- **Address**: 185, Eswaran Kovil Kidangu Street, ERODE - 638 001, Tamil Nadu
- **Wholesale Catalog**: Handloom Mats, Rubber Mats, Fancy Mats, Bed Spreads

---

## ✨ Key Capabilities & Features

1. **Direct Single-Step Admin Authentication**:
   - Simplified direct login using either:
     - **Admin Email** (`achudharaa@gmail.com`)
     - **Visiting Card Mobile Number** (`98426 86264`)
     - **Custom Password**: `SriSuryaTex@2026`
   - **No 2-Step Verification**: Eliminates SMS/OTP or biometric delays for frictionless administrator operations.

2. **2 to 4 Photo Multi-Image Upload**:
   - Upload between 2 and 4 high-resolution photos per product.
   - Client-side canvas compression ensures fast uploads and low memory footprint.
   - Visual angle tags (`★ Cover`, `Angle 2`, `Angle 3`, `Angle 4`) with individual remove/replace buttons.

3. **Complete Catalog Management**:
   - **Add Mat Products**: Set title, category, wholesale rate, unit, bundle pieces, bundles per bale, and stock status.
   - **Edit In-Place**: Update pricing, notices, or replace individual photos.
   - **Quick Disable/Enable**: Disabling an item moves it to the bottom of the catalog and flags it visually without deletion.
   - **Stock Availability Toggle**: One-click toggle between `In Stock` and `Out of Stock`.
   - **Permanent Deletion**: Confirmation dialog before permanently removing obsolete items.

4. **Customer Price Visibility Switch**:
   - Header button (`User Prices: VISIBLE / HIDDEN`) instantly controls whether wholesale buyer sessions on `http://localhost:3001` see factory rates or zero-price indent mode.
   - Broadcasts change immediately via Server-Sent Events (SSE) and updates server settings.

5. **Cross-Origin Central Server Sync**:
   - Syncs all operations (`POST`, `PUT`, `DELETE`) with the Central Server (`http://localhost:10000`).
   - Automatically uploads any locally cached products to the server on load, ensuring zero data loss during offline testing.

6. **Wholesale Orders & Master Bale Packing**:
   - Real-time notification badge when wholesale indents are placed by buyers.
   - Master Bale packing calculator and global bale surcharge configuration modal.

7. **15-Minute Session Inactivity Security**:
   - Automatically tracks user idle time across mouse movements, keystrokes, and touch events, auto-logging out after 15 minutes of inactivity.

---

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite
- **Styling**: Vanilla CSS with Brand Tokens (Deep Navy `#15244c`, Brand Magenta `#9e2267`, Gold `#c89a4b`)
- **Real-Time Integration**: Central Server REST + SSE, Firebase Authentication, Firestore & Cloud Storage
- **Icons**: FontAwesome 6 Free

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)

### Installation
```bash
# Clone the repository
git clone https://github.com/achudharaa-spec/owner.git
cd owner

# Install dependencies
npm install
```

### Environment Configuration
Create a `.env` file in the project root:
```env
# Central Backend Server API
VITE_SERVER_URL=http://localhost:10000

# Store Administrator Credentials
VITE_ADMIN_EMAIL=achudharaa@gmail.com
VITE_ADMIN_PHONE=9842686264
VITE_ADMIN_PASSWORD=SriSuryaTex@2026

# Firebase Credentials
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=sirsuryatex.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=sirsuryatex
VITE_FIREBASE_STORAGE_BUCKET=sirsuryatex.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### Running Locally
```bash
npm run dev
```
The application will launch at **`http://localhost:3000`**.

---

## 📄 License
Private & Proprietary &bull; Sri Surya Tex &bull; All Rights Reserved.
