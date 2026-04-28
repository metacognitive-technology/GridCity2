/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Trash2, 
  Download, 
  Map as MapIcon, 
  Train, 
  Route, 
  MousePointer2,
  Hand,
  Layers,
  Info,
  Undo,
  Redo,
  Copy,
  Scissors,
  ClipboardPaste,
  Square,
  X,
  Grid,
  Save,
  Plus,
  Bookmark,
  Trees,
  Upload,
  LogOut,
  Database,
  Car,
  CarFront,
  PlayCircle,
  FolderOpen
} from 'lucide-react';
import { Tile } from './components/Tile';
import { Vehicle as VehicleComponent } from './components/Vehicle';
import { TileType, GridData, Point, GridTile, Vehicle, RailcarType } from './types';
import { auth, db, handleFirestoreError, isQuotaError, OperationType, loginAnonymously, logout as firebaseLogout } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp, collection, addDoc, deleteDoc, disableNetwork, deleteField, getDoc } from 'firebase/firestore';

const GRID_SIZE = 64;
const INITIAL_ZOOM = 1;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;

const WORDS = [
  "red", "blue", "green", "fast", "slow", "happy", "sad", "big", "small", "tall", 
  "short", "hot", "cold", "brave", "calm", "cool", "dark", "light", "loud", "quiet", 
  "cat", "dog", "bird", "fish", "bear", "lion", "tiger", "wolf", "fox", "deer", 
  "sun", "moon", "star", "sky", "sea", "tree", "rock", "wind", "fire", "ice", 
  "car", "bus", "train", "boat", "ship", "jet", "road", "rail", "path", "town", 
  "city", "farm", "lake", "river", "hill", "mountain", "alpha", "beta", "gamma", "delta"
];
const SIDEBAR_WIDTH = 288;
const MAX_HISTORY = 50;

const TILE_CONNECTIONS: Record<string, number[]> = {
  'road-straight': [0, 2],
  'road-curve': [0, 3],
  'road-t': [0, 2, 3],
  'road-cross': [0, 1, 2, 3],
  'road-bridge': [0, 2],
  'road-oneway-straight': [0, 2],
  'road-oneway-curve': [0, 3],
  'road-4lane-straight': [0, 2],
  'road-4lane-curve': [0, 3],
  'road-4lane-t': [0, 2, 3],
  'road-4lane-cross': [0, 1, 2, 3],
  'road-4lane-bridge': [0, 2],
  'road-transition-2to4': [0, 2],
  'road-roundabout': [0, 1, 2, 3],
  'road-end': [2],
  'road-4lane-end': [2],
  'rail-straight': [0, 2],
  'rail-curve': [0, 3],
  'rail-t': [0, 2, 3],
  'rail-cross': [0, 1, 2, 3],
  'rail-end': [2],
  'rail-trestle': [0, 2],
  'rail-road-crossing': [0, 1, 2, 3],
};

const rotateGridData = (data: GridData): GridData => {
  const rotated: GridData = {};
  const entries = Object.entries(data) as [string, GridTile[]][];
  if (entries.length === 0) return {};

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  entries.forEach(([key]) => {
    const [x, y] = key.split(',').map(Number);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  const width = maxX - minX;
  const height = maxY - minY;

  entries.forEach(([key, tiles]) => {
    const [x, y] = key.split(',').map(Number);
    const relX = x - minX;
    const relY = y - minY;
    
    const newRelX = height - relY;
    const newRelY = relX;
    
    rotated[`${newRelX},${newRelY}`] = tiles.map(tile => ({
      ...tile,
      rotation: (tile.rotation + 90) % 360
    }));
  });

  return rotated;
};

const PALETTE_TILES: { type: TileType; label: string; category: 'road' | 'rail' | 'building' | 'landscape' }[] = [
  { type: 'road-straight', label: 'Straight Road', category: 'road' },
  { type: 'road-curve', label: 'Curve Road', category: 'road' },
  { type: 'road-t', label: 'T-Junction', category: 'road' },
  { type: 'road-cross', label: 'Crossroad', category: 'road' },
  { type: 'road-bridge', label: 'Road Bridge', category: 'road' },
  { type: 'road-oneway-straight', label: 'One-Way St', category: 'road' },
  { type: 'road-oneway-curve', label: 'One-Way Cv', category: 'road' },
  { type: 'road-4lane-straight', label: '4-Lane St', category: 'road' },
  { type: 'road-4lane-curve', label: '4-Lane Cv', category: 'road' },
  { type: 'road-4lane-t', label: '4-Lane T', category: 'road' },
  { type: 'road-4lane-cross', label: '4-Lane X', category: 'road' },
  { type: 'road-4lane-bridge', label: '4-Lane Bridge', category: 'road' },
  { type: 'road-transition-2to4', label: '2-4 Transition', category: 'road' },
  { type: 'road-roundabout', label: 'Roundabout', category: 'road' },
  { type: 'rail-straight', label: 'Straight Rail', category: 'rail' },
  { type: 'rail-curve', label: 'Curve Rail', category: 'rail' },
  { type: 'rail-t', label: 'Rail T-Junction', category: 'rail' },
  { type: 'rail-cross', label: 'Rail Crossing', category: 'rail' },
  { type: 'rail-trestle', label: 'Rail Trestle', category: 'rail' },
  { type: 'rail-road-crossing', label: 'RR Crossing', category: 'rail' },
  { type: 'building-factory', label: 'Factory', category: 'building' },
  { type: 'building-warehouse', label: 'Warehouse', category: 'building' },
  { type: 'building-station', label: 'Train Station', category: 'building' },
  { type: 'building-home', label: 'Home', category: 'building' },
  { type: 'building-school', label: 'School', category: 'building' },
  { type: 'building-store', label: 'Store', category: 'building' },
  { type: 'building-playground', label: 'Playground', category: 'building' },
  { type: 'building-police', label: 'Police Station', category: 'building' },
  { type: 'building-fire', label: 'Fire Station', category: 'building' },
  { type: 'grass-plain', label: 'Grass', category: 'landscape' },
  { type: 'grass-tall', label: 'Tall Grass', category: 'landscape' },
  { type: 'grass-flowers', label: 'Flowers', category: 'landscape' },
  { type: 'tree-pine', label: 'Pine Tree', category: 'landscape' },
  { type: 'tree-oak', label: 'Oak Tree', category: 'landscape' },
  { type: 'landscape-gravel', label: 'Gravel', category: 'landscape' },
  { type: 'landscape-sand', label: 'Sand', category: 'landscape' },
];

export default function App() {
  const [grid, _setGrid] = useState<GridData>({});
  const localGridRef = useRef<GridData>({});
  const lastSyncedGrid = useRef<GridData>({});
  const setGrid = useCallback((newGrid: GridData | ((prev: GridData) => GridData)) => {
    if (typeof newGrid === 'function') {
      _setGrid((prev) => {
        const next = newGrid(prev);
        localGridRef.current = next;
        return next;
      });
    } else {
      localGridRef.current = newGrid;
      _setGrid(newGrid);
    }
  }, []);
  const [history, setHistory] = useState<GridData[]>([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [selectedTile, setSelectedTile] = useState<TileType | null>(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });
  
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Point | null>(null);
  const [clipboard, setClipboard] = useState<GridData | null>(null);
  const [isPasting, setIsPasting] = useState(false);

  const [activeCategory, setActiveCategory] = useState<'road' | 'rail' | 'building' | 'landscape'>('road');
  const [showInfo, setShowInfo] = useState(false);
  const [showGridLines, setShowGridLines] = useState(true);
  const [library, setLibrary] = useState<{ id: string; name: string; data: GridData }[]>([]);
  const [newLayoutName, setNewLayoutName] = useState('');
  const [lastSavedGrid, setLastSavedGrid] = useState<GridData>({});
  const [mousePos, setMousePos] = useState<Point>({ x: 0, y: 0 });
  const [densityModal, setDensityModal] = useState<{ type: 'road' | 'rail' | 'map' | null }>({ type: null });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showLoadConfirm, setShowLoadConfirm] = useState(false);
  const [showDeleteLayoutConfirm, setShowDeleteLayoutConfirm] = useState<{ id: string; name: string } | null>(null);
  const [pendingLayout, setPendingLayout] = useState<GridData | null>(null);
  const [pastePreviewPos, setPastePreviewPos] = useState<Point | null>(null);
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set());
  const [isPlacingVehicles, setIsPlacingVehicles] = useState(false);
  const [showCarManager, setShowCarManager] = useState(false);
  const addCarsCountRef = useRef<HTMLInputElement>(null);
  const [userColor, setUserColor] = useState<string>('#ef4444');

  const [simulations, setSimulations] = useState<any[]>([]);
  const [libraryTab, setLibraryTab] = useState<'layouts' | 'simulations'>('layouts');
  const [showSaveSimulationConfirm, setShowSaveSimulationConfirm] = useState(false);
  const [newSimulationName, setNewSimulationName] = useState('');
  const [showDeleteSimulationConfirm, setShowDeleteSimulationConfirm] = useState<{ id: string; name: string } | null>(null);

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [tempRoomCode, setTempRoomCode] = useState('');
  const lastForceReloadRef = useRef<number>(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [availableRooms, setAvailableRooms] = useState<{ id: string, updatedAt: any }[]>([]);
  const [quotaExceeded, _setQuotaExceeded] = useState(false);
  const setQuotaExceeded = useCallback((val: boolean) => {
    _setQuotaExceeded(val);
    if (val) disableNetwork(db).catch(console.error);
  }, []);

  // Sync library from Firestore
  useEffect(() => {
    if (quotaExceeded) return;
    
    if (!roomCode) {
      const worldsRef = collection(db, 'worlds');
      const unsubscribeWorlds = onSnapshot(worldsRef, (snapshot) => {
        const rooms = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          updatedAt: docSnap.data().updatedAt
        })).sort((a, b) => {
           const timeA = a.updatedAt?.toMillis() || 0;
           const timeB = b.updatedAt?.toMillis() || 0;
           return timeB - timeA;
        });
        setAvailableRooms(rooms);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'worlds'));
      
      return () => unsubscribeWorlds();
    }
  }, [roomCode]);

  useEffect(() => {
    if (quotaExceeded) return;
    const layoutsRef = collection(db, 'layouts');
    const unsubscribeLayouts = onSnapshot(layoutsRef, (snapshot) => {
      const newLibrary = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
        data: docSnap.data().data
      }));
      setLibrary(newLibrary);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'layouts'));
    // Sync simulations from Firestore
    const simsRef = collection(db, 'simulations');
    const unsubscribeSims = onSnapshot(simsRef, (snapshot) => {
      const newSimulations = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        name: docSnap.data().name,
        data: docSnap.data().data
      }));
      setSimulations(newSimulations);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'simulations'));

    return () => {
      unsubscribeLayouts();
      unsubscribeSims();
    };
  }, [quotaExceeded]);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        loginAnonymously().catch(err => {
          console.error("Anonymous login failed:", err);
          if (err.code === 'auth/admin-restricted-operation') {
            setAuthError("Anonymous login is disabled in Firebase Console. Please enable it to allow collaborative building.");
          }
        });
      } else {
        // Assign a random color to the user
        const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        setUserColor(randomColor);
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync grid from Firestore
  useEffect(() => {
    if (!roomCode || quotaExceeded) return;
    
    const worldRef = doc(db, 'worlds', roomCode);
    const unsubscribe = onSnapshot(worldRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.grid) {
          // Compare with current local grid state to avoid loops
          if (JSON.stringify(data.grid) !== JSON.stringify(localGridRef.current)) {
            const pendingChanges: Record<string, any> = {};
            for (const key of Object.keys(localGridRef.current)) {
              if (JSON.stringify(localGridRef.current[key]) !== JSON.stringify(lastSyncedGrid.current[key])) {
                pendingChanges[key] = localGridRef.current[key];
              }
            }
            for (const key of Object.keys(lastSyncedGrid.current)) {
               if (!(key in localGridRef.current)) {
                 pendingChanges[key] = undefined;
               }
            }

            const newMergedGrid = { ...data.grid };
            for (const key in pendingChanges) {
                if (pendingChanges[key] === undefined) {
                   delete newMergedGrid[key];
                } else {
                   newMergedGrid[key] = pendingChanges[key];
                }
            }

            if (JSON.stringify(newMergedGrid) !== JSON.stringify(localGridRef.current)) {
               lastSyncedGrid.current = data.grid;
               setGrid(newMergedGrid);
               setHistory(prev => {
                  const newHistory = [...prev, newMergedGrid];
                  if (newHistory.length > MAX_HISTORY) newHistory.shift();
                  return newHistory;
               });
               setHistoryIndex(prev => {
                  const nextIndex = prev + 1;
                  return nextIndex >= MAX_HISTORY ? MAX_HISTORY - 1 : nextIndex;
               });
            } else {
               lastSyncedGrid.current = data.grid;
            }
          } else {
            lastSyncedGrid.current = data.grid;
          }
        }
        if (data.vehicles) {
          const isForceReload = data.forceReloadVehicles && data.forceReloadVehicles !== lastForceReloadRef.current;
          if (isForceReload) {
            lastForceReloadRef.current = data.forceReloadVehicles;
            setVehicles(data.vehicles);
          } else {
            setVehicles(prev => {
              const nextVehicles = { ...prev };
              let hasChanges = false;
              
              const firestoreIds = new Set(Object.keys(data.vehicles));
              
              for (const id of Object.keys(nextVehicles)) {
                if (!firestoreIds.has(id)) {
                  delete nextVehicles[id];
                  hasChanges = true;
                }
              }

              for (const [id, v] of Object.entries(data.vehicles)) {
                if (!nextVehicles[id]) {
                  nextVehicles[id] = v as Vehicle;
                  hasChanges = true;
                }
              }

              return hasChanges ? nextVehicles : prev;
            });
          }
        }
      } else {
        setDoc(worldRef, { grid: {}, vehicles: {}, updatedAt: serverTimestamp() })
          .catch(err => handleFirestoreError(err, OperationType.WRITE, `worlds/${roomCode}`));
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `worlds/${roomCode}`));

    return () => unsubscribe();
  }, [roomCode, quotaExceeded]);

  // Push local changes to Firestore
  useEffect(() => {
    if (!roomCode || quotaExceeded) return;

    const flushGridUpdates = () => {
      const updates: Record<string, any> = {};
      let hasChanges = false;
      const currentGrid = localGridRef.current;
      const allKeys = new Set([...Object.keys(lastSyncedGrid.current), ...Object.keys(currentGrid)]);
      
      for (const key of allKeys) {
        const currentVal = currentGrid[key];
        const lastVal = lastSyncedGrid.current[key];
        if (JSON.stringify(currentVal) !== JSON.stringify(lastVal)) {
          updates[`grid.${key}`] = currentVal !== undefined ? currentVal : deleteField();
          hasChanges = true;
        }
      }
      
      if (!hasChanges) return;

      updates['updatedAt'] = serverTimestamp();
      lastSyncedGrid.current = currentGrid;

      const worldRef = doc(db, 'worlds', roomCode);
      updateDoc(worldRef, updates).catch(err => {
        if (isQuotaError(err)) {
          setQuotaExceeded(true);
        }
        // If document doesn't exist yet, setDoc instead
        if (err instanceof Error && err.message.includes('not-found')) {
          setDoc(worldRef, { grid: currentGrid, updatedAt: serverTimestamp() })
            .catch(e => {
              if (isQuotaError(e)) {
                setQuotaExceeded(true);
              } else {
                handleFirestoreError(e, OperationType.WRITE, `worlds/${roomCode}`);
              }
            });
        } else {
          handleFirestoreError(err, OperationType.UPDATE, `worlds/${roomCode}`);
        }
      });
    };

    const intervalId = setInterval(flushGridUpdates, 1000); // Batched 1s interval sync

    return () => clearInterval(intervalId);
  }, [roomCode, quotaExceeded]);

  const createRoom = async () => {
    let uniqueCode = "";
    let isUnique = false;

    while (!isUnique) {
        const w1 = WORDS[Math.floor(Math.random() * WORDS.length)];
        const w2 = WORDS[Math.floor(Math.random() * WORDS.length)];
        const w3 = WORDS[Math.floor(Math.random() * WORDS.length)];
        const candidateCode = `${w1}-${w2}-${w3}`;
        
        try {
            const docRef = doc(db, 'worlds', candidateCode);
            const docSnap = await getDoc(docRef);
            if (!docSnap.exists()) {
                uniqueCode = candidateCode;
                isUnique = true;
            }
        } catch (error) {
            console.error("Error checking room code uniqueness", error);
            // Fallback just in case
            uniqueCode = candidateCode;
            isUnique = true;
        }
    }
    setRoomCode(uniqueCode);
  };

  const joinRoom = () => {
    if (tempRoomCode.trim()) {
      setRoomCode(tempRoomCode.trim().toUpperCase());
    }
  };

  const saveToLibrary = async (forceWholeGrid = false) => {
    if (!newLayoutName.trim()) return;

    let dataToSave: GridData = {};

    if (selectionStart && selectionEnd && !forceWholeGrid) {
      const x1 = Math.min(selectionStart.x, selectionEnd.x);
      const y1 = Math.min(selectionStart.y, selectionEnd.y);
      const x2 = Math.max(selectionStart.x, selectionEnd.x);
      const y2 = Math.max(selectionStart.y, selectionEnd.y);

      for (let x = x1; x <= x2; x++) {
        for (let y = y1; y <= y2; y++) {
          const key = `${x},${y}`;
          if (grid[key]) {
            dataToSave[`${x - x1},${y - y1}`] = [...grid[key]];
          }
        }
      }
    } else if (!forceWholeGrid && Object.keys(grid).length > 0) {
      setShowSaveConfirm(true);
      return;
    } else {
      dataToSave = grid;
    }

    try {
      await addDoc(collection(db, 'layouts'), {
        name: newLayoutName.trim(),
        data: dataToSave,
        createdAt: serverTimestamp()
      });
      setNewLayoutName('');
      setLastSavedGrid(grid);
      setSelectionStart(null);
      setSelectionEnd(null);
    } catch (err) {
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
      } else {
        handleFirestoreError(err, OperationType.CREATE, 'layouts');
      }
    }
  };

  const deleteFromLibrary = async (id: string, name: string) => {
    setShowDeleteLayoutConfirm({ id, name });
  };

  const saveToSimulations = async () => {
    if (!newSimulationName.trim()) return;

    try {
      await addDoc(collection(db, 'simulations'), {
        name: newSimulationName.trim(),
        data: { grid, vehicles },
        createdAt: serverTimestamp()
      });
      setNewSimulationName('');
      setShowSaveSimulationConfirm(false);
    } catch (err) {
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
      } else {
        handleFirestoreError(err, OperationType.CREATE, 'simulations');
      }
    }
  };

  const loadSimulation = (sim: any) => {
    setGrid(sim.data.grid || {});
    setVehicles(sim.data.vehicles || {});
    setSelectedVehicles(new Set());
    if (roomCode && !quotaExceeded) {
      updateDoc(doc(db, 'worlds', roomCode), { 
        grid: sim.data.grid || {}, 
        vehicles: sim.data.vehicles || {}, 
        forceReloadVehicles: Date.now(),
        updatedAt: serverTimestamp() 
      }).catch(err => {
        if (isQuotaError(err)) {
          setQuotaExceeded(true);
        } else {
          console.error("Error updating world:", err);
        }
      });
    }
  };

  const confirmDeleteSimulation = async () => {
    if (!showDeleteSimulationConfirm) return;
    try {
      await deleteDoc(doc(db, 'simulations', showDeleteSimulationConfirm.id));
      setShowDeleteSimulationConfirm(null);
    } catch (err) {
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
      } else {
        handleFirestoreError(err, OperationType.DELETE, `simulations/${showDeleteSimulationConfirm.id}`);
      }
    }
  };

  const distributeSelectedCars = () => {
    let updatedVehicles = { ...vehicles };
    let anyUpdates = false;

    selectedVehicles.forEach(id => {
      const v = updatedVehicles[id];
      if (v) {
        const vType = v.type || 'car';
        const roadTiles = Object.entries(grid).filter(([key, tiles]) => 
          (tiles as GridTile[]).some(t => {
            if (t.type === 'rail-road-crossing') return true;
            return vType === 'train' ? (t.type.startsWith('rail') || t.type.includes('trestle')) : t.type.startsWith('road');
          })
        );
        if (roadTiles.length === 0) return;

        const randomRoad = roadTiles[Math.floor(Math.random() * roadTiles.length)];
        const [rx, ry] = randomRoad[0].split(',').map(Number);
        const tileList = randomRoad[1] as GridTile[];
        
        let targetTileIndex = tileList.length - 1;
        // Optionally find the specific road/rail 
        let targetTile = tileList[targetTileIndex];
        let zIndex = 0;
        if (targetTile.type.includes('bridge') || targetTile.type.includes('trestle')) zIndex = 1;

        let heading = targetTile.rotation;
        if (targetTile.type === 'rail-road-crossing' && vType !== 'train') {
           heading = (heading + 90) % 360;
        }

        const is4Lane = targetTile.type.includes('4lane');
        updatedVehicles[id] = {
           ...v,
           x: rx,
           y: ry,
           heading: heading,
           progress: Math.random(),
           lane: vType === 'train' ? 0 : (is4Lane ? (Math.random() > 0.5 ? 1 : 2.5) * (Math.random() > 0.5 ? 1 : -1) : (Math.random() > 0.5 ? 1 : -1)),
           zIndex
        };
        anyUpdates = true;
      }
    });

    if (anyUpdates) {
      setVehicles(updatedVehicles);
    }
  };

  const addRandomCars = (type: 'car' | 'train' | 'semi' = 'car') => {
    const count = parseInt(addCarsCountRef.current?.value || '1', 10);
    if (isNaN(count) || count <= 0) return;

    const roadTiles = Object.entries(grid).filter(([key, tiles]) => 
      (tiles as GridTile[]).some(t => {
        if (t.type === 'rail-road-crossing') return true;
        return type === 'train' ? (t.type.startsWith('rail') || t.type.includes('trestle')) : t.type.startsWith('road');
      })
    );

    if (roadTiles.length === 0) return;

    const updatedVehicles = { ...vehicles };
    const newIds = [];
    
    for(let i=0; i<count; i++) {
        const id = Math.random().toString(36).substring(2, 11);
        newIds.push(id);
        const randomColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        
        let newX = 0, newY = 0, heading = 0, lane = 1, zIndex = 0;
        const randomRoad = roadTiles[Math.floor(Math.random() * roadTiles.length)];
        const [rx, ry] = randomRoad[0].split(',').map(Number);
        const tilesList = randomRoad[1] as GridTile[];
        const topTile = tilesList[tilesList.length - 1];
        const is4Lane = topTile.type.includes('4lane');
        newX = rx;
        newY = ry;
        heading = topTile.rotation;
        if (topTile.type === 'rail-road-crossing' && type !== 'train') {
           heading = (heading + 90) % 360; // Cars should go along the road axis
        }
        lane = type === 'train' ? 0 : (is4Lane ? (Math.random() > 0.5 ? 1 : 2.5) * (Math.random() > 0.5 ? 1 : -1) : (Math.random() > 0.5 ? 1 : -1));
        zIndex = topTile.type.includes('bridge') || topTile.type.includes('trestle') ? 1 : 0;

        updatedVehicles[id] = {
           id,
           type,
           x: newX,
           y: newY,
           heading,
           progress: Math.random(),
           lane,
           color: randomColor,
           zIndex,
           isMoving: true,
           speed: 1,
           turnAroundAtDeadEnd: true,
           randomTurning: true,
           turnIntent: ['left', 'right', 'straight'][Math.floor(Math.random() * 3)] as any,
           trailers: type === 'semi' ? 1 : 0,
        };
    }
    setVehicles(updatedVehicles);
    setSelectedVehicles(new Set([...selectedVehicles, ...newIds]));
    if (roomCode && !quotaExceeded) {
        const worldRef = doc(db, 'worlds', roomCode);
        updateDoc(worldRef, { vehicles: updatedVehicles, updatedAt: serverTimestamp() })
          .catch(err => {
            if (isQuotaError(err)) {
              setQuotaExceeded(true);
            }
          });
    }
  };

  const removeSelectedCars = () => {
    if (selectedVehicles.size === 0) return;
    const updatedVehicles = { ...vehicles };
    selectedVehicles.forEach(id => {
      delete updatedVehicles[id];
    });
    setVehicles(updatedVehicles);
    setSelectedVehicles(new Set());
    if (roomCode && !quotaExceeded) {
      const worldRef = doc(db, 'worlds', roomCode);
      updateDoc(worldRef, { vehicles: updatedVehicles, updatedAt: serverTimestamp() })
        .catch(err => {
          if (isQuotaError(err)) setQuotaExceeded(true);
        });
    }
  };

  const toggleAllCars = () => {
    if (selectedVehicles.size === Object.keys(vehicles).length) {
      setSelectedVehicles(new Set());
    } else {
      setSelectedVehicles(new Set(Object.keys(vehicles)));
    }
  };

  const toggleSelectedCarsAttribute = (attr: 'isMoving' | 'turnAroundAtDeadEnd' | 'randomTurning') => {
    if (selectedVehicles.size === 0) return;
    const updatedVehicles = { ...vehicles };
    let anyUpdates = false;

    // determine majority state to toggle to opposite
    let activeCount = 0;
    selectedVehicles.forEach(id => {
      if (updatedVehicles[id]?.[attr]) activeCount++;
    });
    const newState = activeCount < selectedVehicles.size / 2;

    selectedVehicles.forEach(id => {
      if (updatedVehicles[id]) {
        updatedVehicles[id] = { ...updatedVehicles[id], [attr]: newState };
        anyUpdates = true;
      }
    });

    if (anyUpdates) {
      setVehicles(updatedVehicles);
      if (roomCode && !quotaExceeded) {
        const worldRef = doc(db, 'worlds', roomCode);
        updateDoc(worldRef, { vehicles: updatedVehicles, updatedAt: serverTimestamp() }).catch(err => {
          if (isQuotaError(err)) setQuotaExceeded(true);
        });
      }
    }
  };

  const changeSelectedTrailers = (delta: number) => {
    if (selectedVehicles.size === 0) return;
    const updatedVehicles = { ...vehicles };
    let anyUpdates = false;
    selectedVehicles.forEach(id => {
      const v = updatedVehicles[id];
      if (v && v.type === 'semi') {
        const current = v.trailers ?? 1;
        const next = Math.max(0, Math.min(2, current + delta));
        if (current !== next) {
          updatedVehicles[id] = { ...v, trailers: next };
          anyUpdates = true;
        }
      }
    });

    if (anyUpdates) {
      setVehicles(updatedVehicles);
      if (roomCode && !quotaExceeded) {
        const worldRef = doc(db, 'worlds', roomCode);
        updateDoc(worldRef, { vehicles: updatedVehicles, updatedAt: serverTimestamp() }).catch(err => {
          if (isQuotaError(err)) setQuotaExceeded(true);
        });
      }
    }
  };

  const modifySelectedRailcars = (action: 'add' | 'remove' | 'move', payload?: any) => {
    if (selectedVehicles.size === 0) return;
    const updatedVehicles = { ...vehicles };
    let anyUpdates = false;

    selectedVehicles.forEach(id => {
      const v = updatedVehicles[id];
      if (v && v.type === 'train') {
        const rc = [...(v.railcars || [])];
        let changed = false;

        if (action === 'add' && rc.length < 12) {
          rc.push(payload as RailcarType);
          changed = true;
        } else if (action === 'remove') {
          rc.splice(payload as number, 1);
          changed = true;
        } else if (action === 'move') {
          const { from, to } = payload as { from: number, to: number };
          if (from >= 0 && from < rc.length && to >= 0 && to < rc.length) {
            const temp = rc[from];
            rc.splice(from, 1);
            rc.splice(to, 0, temp);
            changed = true;
          }
        }

        if (changed) {
          updatedVehicles[id] = { ...v, railcars: rc };
          anyUpdates = true;
        }
      }
    });

    if (anyUpdates) {
      setVehicles(updatedVehicles);
      if (roomCode && !quotaExceeded) {
        const worldRef = doc(db, 'worlds', roomCode);
        updateDoc(worldRef, { vehicles: updatedVehicles, updatedAt: serverTimestamp() }).catch(err => {
          if (isQuotaError(err)) setQuotaExceeded(true);
        });
      }
    }
  };

  const changeSelectedCarsSpeed = (newSpeed: number) => {
    if (selectedVehicles.size === 0) return;
    const updatedVehicles = { ...vehicles };
    let anyUpdates = false;
    selectedVehicles.forEach(id => {
      if (updatedVehicles[id]) {
        updatedVehicles[id] = { ...updatedVehicles[id], speed: newSpeed };
        anyUpdates = true;
      }
    });

    if (anyUpdates) {
      setVehicles(updatedVehicles);
      if (roomCode && !quotaExceeded) {
        const worldRef = doc(db, 'worlds', roomCode);
        updateDoc(worldRef, { vehicles: updatedVehicles, updatedAt: serverTimestamp() }).catch(err => {
          if (isQuotaError(err)) setQuotaExceeded(true);
        });
      }
    }
  };

  const requestRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const updateVehicleLoop = useCallback((time: number) => {
    if (lastTimeRef.current !== 0) {
      const deltaTime = time - lastTimeRef.current;
      
      setVehicles(prev => {
        let hasChanges = false;
        const nextVehicles = { ...prev };

        for (const [uid, v] of Object.entries(prev)) {
          const vehicle = v as Vehicle;
          if (!vehicle.isMoving && !vehicle.stepForward && !vehicle.stepBackward) continue;
          hasChanges = true;

          const speed = vehicle.speed || 1;
          let step = 0;
          
          if (vehicle.isMoving) {
            step = (speed * deltaTime) / 1000;
          } else if (vehicle.stepForward) {
            step = 0.1; // One step forward
          } else if (vehicle.stepBackward) {
            step = -0.1; // One step backward
          }
          
          let { x, y, heading, lane, progress, zIndex, turnIntent } = vehicle;
          progress += step;

          let newVehicleState = { ...vehicle, progress };
          
          if (vehicle.stepForward || vehicle.stepBackward) {
            newVehicleState.stepForward = false;
            newVehicleState.stepBackward = false;
          }

          // Handle tile boundaries (forward)
          if (progress >= 1) {
            let exitHeading = heading;
            const currentTiles = grid[`${x},${y}`];
            const currentTile = currentTiles?.find(t => {
              const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
              return (zIndex === 1 && isBridge) || (zIndex === 0 && !isBridge);
            });

            if (currentTile) {
              const ports = (TILE_CONNECTIONS[currentTile.type] || []).map(p => (p + currentTile.rotation / 90) % 4);
              const entryPort = (heading / 90 + 2) % 4;
              let otherPorts = ports.filter(p => p !== entryPort);
              
              if (currentTile.type === 'rail-road-crossing') {
                const straightPort = (entryPort + 2) % 4;
                otherPorts = otherPorts.includes(straightPort) ? [straightPort] : [];
              }
              
              if (otherPorts.length > 0) {
                let exitPort = otherPorts[0];
                if (otherPorts.length > 1) {
                  const straightPort = (entryPort + 2) % 4;
                  const leftPort = (entryPort + 3) % 4;
                  const rightPort = (entryPort + 1) % 4;

                  if (turnIntent === 'left' && otherPorts.includes(leftPort)) exitPort = leftPort;
                  else if (turnIntent === 'right' && otherPorts.includes(rightPort)) exitPort = rightPort;
                  else if (otherPorts.includes(straightPort)) exitPort = straightPort;
                }
                exitHeading = exitPort * 90;
              }
            }

            const dx = exitHeading === 90 ? 1 : exitHeading === 270 ? -1 : 0;
            const dy = exitHeading === 180 ? 1 : exitHeading === 0 ? -1 : 0;
            const nextX = x + dx;
            const nextY = y + dy;
            const nextKey = `${nextX},${nextY}`;
            
            if (grid[nextKey]) {
              const nextTiles = grid[nextKey];
              let validNextTiles = nextTiles.filter(t => {
                const isCrossing = t.type === 'rail-road-crossing';
                if (vehicle.type === 'train') return t.type.startsWith('rail') || isCrossing;
                else return t.type.startsWith('road') || isCrossing;
              });

              let nextTile = validNextTiles.find(t => {
                const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
                return (zIndex === 1 && isBridge) || (zIndex === 0 && !isBridge);
              }) || validNextTiles[0];

              if (nextTile) {
                const nextPorts = (TILE_CONNECTIONS[nextTile.type] || []).map(p => (p + nextTile.rotation / 90) % 4);
                const nextEntryPort = (exitHeading / 90 + 2) % 4;

                if (nextPorts.includes(nextEntryPort)) {
                  const isNext4Lane = nextTile.type.includes('4lane');
                  const nextIsBridge = nextTile.type.includes('bridge') || nextTile.type.includes('trestle');
                  
                  // Force vehicles strictly forward on rail crossings without turning
                  if (nextTile.type === 'rail-road-crossing') {
                     const isEnteringRailAxis = (nextEntryPort % 2 === (nextTile.rotation / 90) % 2);
                     if (vehicle.type === 'train' && !isEnteringRailAxis) {
                         // Turn around if Train entering road axis
                         newVehicleState = vehicle.turnAroundAtDeadEnd !== false ? { 
                           ...vehicle, heading: (exitHeading + 180) % 360, progress: 0, isMoving: true 
                         } : { ...vehicle, progress: 0.99, isMoving: false };
                     } else if (vehicle.type !== 'train' && isEnteringRailAxis) {
                         // Turn around if Car entering rail axis
                         newVehicleState = vehicle.turnAroundAtDeadEnd !== false ? { 
                           ...vehicle, heading: (exitHeading + 180) % 360, progress: 0, isMoving: true 
                         } : { ...vehicle, progress: 0.99, isMoving: false };
                     } else {
                         // Must continue straight over the crossing without turning intent checking
                         newVehicleState = {
                           ...vehicle,
                           x: nextX,
                           y: nextY,
                           heading: exitHeading,
                           progress: progress - 1,
                           zIndex: 0,
                           turnIntent: null,
                           lane: vehicle.type === 'train' ? 0 : 1 
                         };
                     }
                  } else {
                    newVehicleState = {
                      ...vehicle,
                      x: nextX,
                      y: nextY,
                      heading: exitHeading,
                      progress: progress - 1,
                      zIndex: nextIsBridge ? 1 : 0,
                      turnIntent: vehicle.randomTurning ? ['left', 'right', 'straight'][Math.floor(Math.random() * 3)] as any : null,
                      lane: vehicle.type === 'train' ? 0 : isNext4Lane ? vehicle.lane : 1 
                    };
                  }
                  } else {
                    // Turn around at dead end (not connected port)
                    newVehicleState = vehicle.turnAroundAtDeadEnd !== false ? { 
                      ...vehicle, 
                      heading: (exitHeading + 180) % 360, 
                      progress: 0, 
                      isMoving: true 
                    } : { ...vehicle, progress: 0.99, isMoving: false };
                  }
                } else {
                  // Turn around if no matching tile
                  newVehicleState = vehicle.turnAroundAtDeadEnd !== false ? { 
                    ...vehicle, 
                    heading: (exitHeading + 180) % 360, 
                    progress: 0, 
                    isMoving: true 
                  } : { ...vehicle, progress: 0.99, isMoving: false };
                }
              } else {
              // Turn around if no next tile in grid
              newVehicleState = vehicle.turnAroundAtDeadEnd !== false ? { 
                ...vehicle, 
                heading: (exitHeading + 180) % 360, 
                progress: 0, 
                isMoving: true 
              } : { ...vehicle, progress: 0.99, isMoving: false };
            }
          } else if (progress < 0) {
            // Simple clamping for backward movement to avoid complex backward routing
            newVehicleState.progress = 0;
          }

          nextVehicles[uid] = newVehicleState;
        }

        return hasChanges ? nextVehicles : prev;
      });
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(updateVehicleLoop);
  }, [user, grid]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(updateVehicleLoop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [updateVehicleLoop]);

  const confirmDeleteFromLibrary = async () => {
    if (!showDeleteLayoutConfirm) return;
    try {
      await deleteDoc(doc(db, 'layouts', showDeleteLayoutConfirm.id));
      setShowDeleteLayoutConfirm(null);
    } catch (err) {
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
      } else {
        handleFirestoreError(err, OperationType.DELETE, `layouts/${showDeleteLayoutConfirm.id}`);
      }
    }
  };

  const loadFromLibrary = (data: GridData) => {
    setPendingLayout(data);
    setShowLoadConfirm(true);
  };

  const addToHistory = useCallback((newGrid: GridData) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(newGrid);
      if (newHistory.length > MAX_HISTORY) {
        newHistory.shift();
      }
      return newHistory;
    });
    setHistoryIndex(prev => {
      const nextIndex = prev + 1;
      return nextIndex >= MAX_HISTORY ? MAX_HISTORY - 1 : nextIndex;
    });
  }, [historyIndex]);

  const rotateClipboard = useCallback(() => {
    if (!clipboard) return;
    setClipboard(rotateGridData(clipboard));
  }, [clipboard]);

  const rotateSelection = useCallback(() => {
    if (!selectionStart || !selectionEnd) return;
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    const selectedData: GridData = {};
    const newGrid = { ...grid };
    let hasTiles = false;
    
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        const key = `${x},${y}`;
        if (grid[key]) {
          selectedData[`${x - x1},${y - y1}`] = [...grid[key]];
          delete newGrid[key];
          hasTiles = true;
        }
      }
    }

    if (!hasTiles) return;

    const rotated = rotateGridData(selectedData);
    
    (Object.entries(rotated) as [string, GridTile[]][]).forEach(([relKey, tiles]) => {
      const [rx, ry] = relKey.split(',').map(Number);
      newGrid[`${x1 + rx},${y1 + ry}`] = tiles;
    });

    setGrid(newGrid);
    addToHistory(newGrid);
    
    const width = x2 - x1;
    const height = y2 - y1;
    setSelectionEnd({ x: x1 + height, y: y1 + width });
  }, [grid, selectionStart, selectionEnd]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setGrid(history[newIndex]);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setGrid(history[newIndex]);
    }
  }, [history, historyIndex]);

  const copySelection = useCallback(() => {
    if (!selectionStart || !selectionEnd) return;
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    const newClipboard: GridData = {};
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        const key = `${x},${y}`;
        if (grid[key]) {
          newClipboard[`${x - x1},${y - y1}`] = [...grid[key]];
        }
      }
    }
    setClipboard(newClipboard);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [grid, selectionStart, selectionEnd]);

  const cutSelection = useCallback(() => {
    if (!selectionStart || !selectionEnd) return;
    copySelection();
    
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    const newGrid = { ...grid };
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        delete newGrid[`${x},${y}`];
      }
    }
    setGrid(newGrid);
    addToHistory(newGrid);
  }, [grid, selectionStart, selectionEnd, copySelection]);

  const deleteSelection = useCallback(() => {
    if (!selectionStart || !selectionEnd) return;
    
    const x1 = Math.min(selectionStart.x, selectionEnd.x);
    const y1 = Math.min(selectionStart.y, selectionEnd.y);
    const x2 = Math.max(selectionStart.x, selectionEnd.x);
    const y2 = Math.max(selectionStart.y, selectionEnd.y);

    const newGrid = { ...grid };
    let hasChanges = false;
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        const key = `${x},${y}`;
        if (newGrid[key]) {
          delete newGrid[key];
          hasChanges = true;
        }
      }
    }
    
    if (hasChanges) {
      setGrid(newGrid);
      addToHistory(newGrid);
    }
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [grid, selectionStart, selectionEnd]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.repeat) return;

      // Vehicle controls
      if (selectedVehicles.size > 0) {
        const key = e.key.toLowerCase();
        let anyUpdated = false;
        const updatedVehicles = { ...vehicles };

        selectedVehicles.forEach(id => {
          const myVehicle = updatedVehicles[id];
          if (!myVehicle) return;
          let updated = false;
          let newVehicle = { ...myVehicle };

          if (key === 'g') {
            newVehicle.isMoving = !newVehicle.isMoving;
            updated = true;
          } else if (key === 's') {
            if (newVehicle.isMoving !== false) {
              newVehicle.isMoving = false;
              updated = true;
            }
          } else if (key === 'f') {
            newVehicle.isMoving = false;
            newVehicle.stepForward = true;
            updated = true;
          } else if (key === 'b') {
            newVehicle.isMoving = false;
            newVehicle.stepBackward = true;
            updated = true;
          } else if (e.key === 'ArrowUp') {
            const newSpeed = Math.min((newVehicle.speed || 1) + 0.5, 5);
            if (newVehicle.speed !== newSpeed) {
              newVehicle.speed = newSpeed;
              updated = true;
            }
          } else if (e.key === 'ArrowDown') {
            const newSpeed = Math.max((newVehicle.speed || 1) - 0.5, 0.5);
            if (newVehicle.speed !== newSpeed) {
              newVehicle.speed = newSpeed;
              updated = true;
            }
          } else if (key === 'l' || key === 'r') {
            const currentTiles = grid[`${myVehicle.x},${myVehicle.y}`];
            const currentTile = currentTiles?.find(t => {
              const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
              return (myVehicle.zIndex === 1 && isBridge) || (myVehicle.zIndex === 0 && !isBridge);
            });
            
            const isIntersection = currentTile && (currentTile.type.includes('cross') || currentTile.type.includes('t') || currentTile.type.includes('roundabout'));
            const is4Lane = currentTile?.type.includes('4lane');
            const isOneWay = currentTile?.type.includes('oneway');
            
            if (!isIntersection && is4Lane) {
              if (key === 'r') {
                if (newVehicle.lane === 1) {
                  if (newVehicle.turnIntent !== 'left') {
                    newVehicle.turnIntent = 'left';
                    updated = true;
                  }
                } else {
                  newVehicle.lane = 1;
                  updated = true;
                }
              } else if (key === 'l') {
                if (newVehicle.lane === 2.5) {
                  if (newVehicle.turnIntent !== 'right') {
                    newVehicle.turnIntent = 'right';
                    updated = true;
                  }
                } else {
                  newVehicle.lane = 2.5;
                  updated = true;
                }
              }
            } else if (!isIntersection && isOneWay) {
              if (key === 'r') {
                if (newVehicle.lane === -1) {
                  if (newVehicle.turnIntent !== 'left') {
                    newVehicle.turnIntent = 'left';
                    updated = true;
                  }
                } else {
                  newVehicle.lane = -1;
                  updated = true;
                }
              } else if (key === 'l') {
                if (newVehicle.lane === 1) {
                  if (newVehicle.turnIntent !== 'right') {
                    newVehicle.turnIntent = 'right';
                    updated = true;
                  }
                } else {
                  newVehicle.lane = 1;
                  updated = true;
                }
              }
            } else {
              const intent = key === 'r' ? 'left' : 'right';
              if (newVehicle.turnIntent !== intent) {
                newVehicle.turnIntent = intent;
                updated = true;
              }
            }
          }

          if (updated) {
            updatedVehicles[id] = newVehicle;
            anyUpdated = true;
          }
        });

        if (anyUpdated) {
          setVehicles(updatedVehicles);
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') redo();
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') copySelection();
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') cutSelection();
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboard) {
          setIsPasting(true);
          setSelectedTile(null);
        }
      }

      if (e.key.toLowerCase() === 'r') {
        if (isPasting) {
          rotateClipboard();
        } else if (selectionStart && selectionEnd) {
          rotateSelection();
        } else {
          setRotation(prev => (prev + 90) % 360);
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectionStart && selectionEnd) {
          deleteSelection();
        }
      }
      if (e.key === 'Escape') {
        setSelectedTile(null);
        setIsPasting(false);
        setSelectionStart(null);
        setSelectionEnd(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, copySelection, cutSelection, deleteSelection, clipboard, rotateClipboard, rotateSelection, isPasting, selectionStart, selectionEnd, vehicles, user]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldX = Math.floor((e.clientX - rect.left - offset.x) / zoom / GRID_SIZE);
    const worldY = Math.floor((e.clientY - rect.top - offset.y) / zoom / GRID_SIZE);

    if (e.button === 1 || (e.button === 0 && !selectedTile && !isPasting && !e.altKey)) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    } else if (e.button === 0 && e.altKey) {
      setIsSelecting(true);
      setSelectionStart({ x: worldX, y: worldY });
      setSelectionEnd({ x: worldX, y: worldY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const worldX = Math.floor((e.clientX - rect.left - offset.x) / zoom / GRID_SIZE);
    const worldY = Math.floor((e.clientY - rect.top - offset.y) / zoom / GRID_SIZE);

    if (isPanning) {
      setOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    } else if (isSelecting) {
      setSelectionEnd({ x: worldX, y: worldY });
    }

    if (isPasting) {
      setPastePreviewPos({ x: worldX, y: worldY });
    } else {
      setPastePreviewPos(null);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setIsSelecting(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * delta));
    
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldX = (mouseX - offset.x) / zoom;
      const worldY = (mouseY - offset.y) / zoom;

      setZoom(newZoom);
      setOffset({
        x: mouseX - worldX * newZoom,
        y: mouseY - worldY * newZoom,
      });
    }
  };

  const getClipboardOffset = useCallback(() => {
    if (!clipboard) return { x: 0, y: 0 };
    const keys = Object.keys(clipboard);
    if (keys.length === 0) return { x: 0, y: 0 };
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    keys.forEach(key => {
      const [x, y] = key.split(',').map(Number);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    });
    
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    
    return {
      x: Math.floor(width / 2) + minX,
      y: Math.floor(height / 2) + minY
    };
  }, [clipboard]);

  const handleGridClick = (e: React.MouseEvent) => {
    if (isPanning || isSelecting) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - offset.x) / zoom;
    const worldY = (mouseY - offset.y) / zoom;

    const gridX = Math.floor(worldX / GRID_SIZE);
    const gridY = Math.floor(worldY / GRID_SIZE);

    const key = `${gridX},${gridY}`;
    
    if (isPasting && clipboard) {
      const offset = getClipboardOffset();
      const newGrid = { ...grid };
      (Object.entries(clipboard) as [string, GridTile[]][]).forEach(([relKey, tiles]) => {
        const [rx, ry] = relKey.split(',').map(Number);
        const targetKey = `${gridX + rx - offset.x},${gridY + ry - offset.y}`;
        // Only apply if there are tiles in the clipboard cell (ignore empty cells)
        if (tiles && tiles.length > 0) {
          newGrid[targetKey] = [...tiles];
        }
      });
      setGrid(newGrid);
      addToHistory(newGrid);
      setIsPasting(false);
      setPastePreviewPos(null);
      return;
    }

    if (!selectedTile) {
      // Handle placing selected vehicles if mode is active
      if (isPlacingVehicles && selectedVehicles.size > 0 && grid[key]) {
        const localX = worldX - gridX * GRID_SIZE;
        const localY = worldY - gridY * GRID_SIZE;
        const existingTiles = grid[key];
        const targetTile = existingTiles[existingTiles.length - 1];
        
        let zIndex = 0;
        if (targetTile.type.includes('bridge') || targetTile.type.includes('trestle')) {
          zIndex = 1;
        }

        let lane = 1;
        let heading = targetTile.rotation;
        
        const relX = localX / GRID_SIZE;
        const relY = localY / GRID_SIZE;
        
        const is4Lane = targetTile.type.includes('4lane');
        const isOneWay = targetTile.type.includes('oneway');
        const isRail = targetTile.type.startsWith('rail');

        if (isRail) {
          lane = 0;
          if (targetTile.rotation === 0 || targetTile.rotation === 180) {
            heading = relY > 0.5 ? 0 : 180;
          } else {
            heading = relX < 0.5 ? 90 : 270;
          }
        } else if (isOneWay) {
          heading = targetTile.rotation;
          if (heading === 0 || heading === 180) {
            lane = relX > 0.5 ? 1 : -1;
            if (heading === 180) lane = -lane;
          } else {
            lane = relY > 0.5 ? -1 : 1;
            if (heading === 270) lane = -lane;
          }
        } else {
          if (targetTile.rotation === 0 || targetTile.rotation === 180 || targetTile.type.includes('cross')) {
            if (relX > 0.5) {
              heading = 0;
              lane = is4Lane ? (relX > 0.75 ? 2.5 : 1) : 1;
            } else {
              heading = 180;
              lane = is4Lane ? (relX < 0.25 ? 2.5 : 1) : 1;
            }
          } else {
            if (relY > 0.5) {
              heading = 90;
              lane = is4Lane ? (relY > 0.75 ? 2.5 : 1) : 1;
            } else {
              heading = 270;
              lane = is4Lane ? (relY < 0.25 ? 2.5 : 1) : 1;
            }
          }
        }

        const updatedVehicles = { ...vehicles };
        selectedVehicles.forEach(id => {
          if (updatedVehicles[id]) {
            updatedVehicles[id] = {
              ...updatedVehicles[id],
              x: gridX,
              y: gridY,
              heading,
              lane,
              progress: 0.5,
              zIndex
            };
          }
        });

        setVehicles(updatedVehicles);
        return;
      }

      // Spawn new single vehicle on alt-click
      if (e.altKey && grid[key]) {
        const localX = worldX - gridX * GRID_SIZE;
        const localY = worldY - gridY * GRID_SIZE;
        
        // Determine if we clicked a bridge or ground tile
        const existingTiles = grid[key];
        let targetTile = existingTiles[existingTiles.length - 1];
        let zIndex = 0;
        
        // If there's a bridge, check if we clicked "high" or "low"
        // For simplicity, we'll check the top tile first. 
        // If it's a bridge, we're on zIndex 1.
        if (targetTile.type.includes('bridge') || targetTile.type.includes('trestle')) {
          zIndex = 1;
        }

        if (targetTile.type.startsWith('road') || targetTile.type.startsWith('rail')) {
          // Determine lane and direction based on click position
          let lane = 1;
          let heading = targetTile.rotation;
          
          const relX = localX / GRID_SIZE;
          const relY = localY / GRID_SIZE;
          
          const is4Lane = targetTile.type.includes('4lane');
          const isOneWay = targetTile.type.includes('oneway');
          const isRail = targetTile.type.startsWith('rail');

          if (isRail) {
            lane = 0;
            if (targetTile.rotation === 0 || targetTile.rotation === 180) {
              heading = relY > 0.5 ? 0 : 180;
            } else {
              heading = relX < 0.5 ? 90 : 270;
            }
          } else if (isOneWay) {
            heading = targetTile.rotation;
            if (heading === 0 || heading === 180) {
              lane = relX > 0.5 ? 1 : -1;
              if (heading === 180) lane = -lane;
            } else {
              lane = relY > 0.5 ? -1 : 1;
              if (heading === 270) lane = -lane;
            }
          } else {
            if (targetTile.rotation === 0 || targetTile.rotation === 180 || targetTile.type.includes('cross')) {
              if (relX > 0.5) {
                heading = 0;
                lane = is4Lane ? (relX > 0.75 ? 2.5 : 1) : 1;
              } else {
                heading = 180;
                lane = is4Lane ? (relX < 0.25 ? 2.5 : 1) : 1;
              }
            } else {
              if (relY > 0.5) {
                heading = 90;
                lane = is4Lane ? (relY > 0.75 ? 2.5 : 1) : 1;
              } else {
                heading = 270;
                lane = is4Lane ? (relY < 0.25 ? 2.5 : 1) : 1;
              }
            }
          }

          const newId = Math.random().toString(36).substring(2, 11);
          const newType = isRail ? 'train' : 'car';
          const newVehicle: Vehicle = {
            id: newId,
            type: newType,
            x: gridX,
            y: gridY,
            heading: heading,
            lane: lane,
            progress: 0.5,
            color: userColor,
            zIndex: zIndex,
            isMoving: false,
            speed: 1,
            turnAroundAtDeadEnd: true,
            randomTurning: true,
            turnIntent: ['left', 'right', 'straight'][Math.floor(Math.random() * 3)] as any,
            trailers: newType === 'semi' ? 1 : 0,
          };
          const updatedVehicles = { ...vehicles, [newId]: newVehicle };
          setVehicles(updatedVehicles);
          setSelectedVehicles(new Set([...selectedVehicles, newId]));
          if (roomCode && !quotaExceeded) {
            const worldRef = doc(db, 'worlds', roomCode);
            updateDoc(worldRef, { vehicles: updatedVehicles, updatedAt: serverTimestamp() })
              .catch(err => {
                if (isQuotaError(err)) {
                  setQuotaExceeded(true);
                } else {
                  console.error("Error updating vehicles:", err);
                }
              });
          }
        }
      }
      return;
    }

    if (e.shiftKey) {
      const newGrid = { ...grid };
      delete newGrid[key];
      setGrid(newGrid);
      addToHistory(newGrid);
    } else {
      const newGrid = { ...grid };
      const existingTiles = grid[key] || [];
      
      const isBuilding = selectedTile.startsWith('building-');
      const isTree = selectedTile.startsWith('tree-');
      const finalRotation = (isBuilding || isTree) ? 0 : rotation;
      
      const newTile: GridTile = { type: selectedTile, rotation: finalRotation };
      
      const isNewBridge = selectedTile === 'road-bridge' || selectedTile === 'rail-trestle' || selectedTile === 'road-4lane-bridge';
      const hasLowerSection = existingTiles.some(t => 
        t.type.startsWith('road-') || t.type.startsWith('rail-')
      ) && !existingTiles.some(t => t.type === 'road-bridge' || t.type === 'rail-trestle' || t.type === 'road-4lane-bridge');

      if (isNewBridge && hasLowerSection) {
        // Stack bridge on top of existing road/rail
        newGrid[key] = [...existingTiles, newTile];
      } else if (!isNewBridge && existingTiles.some(t => t.type === 'road-bridge' || t.type === 'rail-trestle' || t.type === 'road-4lane-bridge')) {
        // If placing road/rail under a bridge
        const isNewRoadRail = selectedTile.startsWith('road-') || selectedTile.startsWith('rail-');
        if (isNewRoadRail) {
          newGrid[key] = [newTile, ...existingTiles.filter(t => t.type === 'road-bridge' || t.type === 'rail-trestle' || t.type === 'road-4lane-bridge')];
        } else {
          newGrid[key] = [newTile];
        }
      } else {
        // Default replacement
        newGrid[key] = [newTile];
      }

      setGrid(newGrid);
      addToHistory(newGrid);
    }
  };

  const clearGrid = () => {
    setGrid({});
    addToHistory({});
  };

  const exportGrid = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(grid));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "gridcity_layout.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const importGrid = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        setClipboard(data);
        setIsPasting(true);
        setSelectedTile(null);
      } catch (err) {
        console.error('Failed to parse imported file', err);
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  const randomLandscaping = (baseGrid?: GridData) => {
    const currentGrid = baseGrid || grid;
    const newGrid = { ...currentGrid };
    const landscapables = PALETTE_TILES.filter(t => t.category === 'landscape').map(t => t.type);
    const buildings = PALETTE_TILES.filter(t => t.category === 'building').map(t => t.type);
    
    // Rules: which tiles can be adjacent to each other
    const rules: Record<string, string[]> = {
      'grass-plain': ['grass-plain', 'grass-tall', 'grass-flowers', 'tree-pine', 'tree-oak', 'landscape-gravel', 'landscape-sand', ...buildings],
      'grass-tall': ['grass-plain', 'grass-tall', 'grass-flowers'],
      'grass-flowers': ['grass-plain', 'grass-tall', 'grass-flowers'],
      'tree-pine': ['grass-plain', 'tree-pine', 'tree-oak'],
      'tree-oak': ['grass-plain', 'tree-pine', 'tree-oak'],
      'landscape-gravel': ['grass-plain', 'landscape-gravel', 'landscape-sand'],
      'landscape-sand': ['grass-plain', 'landscape-gravel', 'landscape-sand'],
    };
    buildings.forEach(b => {
      rules[b] = ['grass-plain'];
    });

    const weights: Record<string, number> = {
      'grass-plain': 20,
      'grass-tall': 8,
      'grass-flowers': 5,
      'tree-pine': 6,
      'tree-oak': 6,
      'landscape-gravel': 3,
      'landscape-sand': 3,
    };
    buildings.forEach(b => {
      weights[b] = 2; // Low weight for buildings in landscaping
    });

    // Determine bounds
    let minX: number, minY: number, maxX: number, maxY: number;
    if (selectionStart && selectionEnd) {
      minX = Math.min(selectionStart.x, selectionEnd.x);
      maxX = Math.max(selectionStart.x, selectionEnd.x);
      minY = Math.min(selectionStart.y, selectionEnd.y);
      maxY = Math.max(selectionStart.y, selectionEnd.y);
    } else {
      minX = -10; minY = -10; maxX = 10; maxY = 10;
      const keys = Object.keys(currentGrid);
      if (keys.length > 0) {
        keys.forEach(key => {
          const [x, y] = key.split(',').map(Number);
          minX = Math.min(minX, x - 5);
          minY = Math.min(minY, y - 5);
          maxX = Math.max(maxX, x + 5);
          maxY = Math.max(maxY, y + 5);
        });
      }
    }

    // Limit size to avoid performance issues (WFC is O(N^2) or worse depending on propagation)
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    if (rangeX * rangeY > 1600) { // Max 40x40 area
      const centerX = Math.floor((minX + maxX) / 2);
      const centerY = Math.floor((minY + maxY) / 2);
      minX = centerX - 20;
      maxX = centerX + 20;
      minY = centerY - 20;
      maxY = centerY + 20;
    }

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const wave: string[][] = Array(width * height).fill(null).map(() => [...landscapables, ...buildings]);
    const collapsed: (string | null)[] = Array(width * height).fill(null);

    // Fill in existing landscape tiles if any (to seed the WFC)
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = `${x},${y}`;
        const idx = (x - minX) + (y - minY) * width;
        if (currentGrid[key]) {
          const topTile = currentGrid[key][currentGrid[key].length - 1];
          if (landscapables.includes(topTile.type)) {
            collapsed[idx] = topTile.type;
            wave[idx] = [topTile.type];
          } else {
             // Non-landscape tiles act as "grass-plain" for constraint purposes
             collapsed[idx] = 'grass-plain';
             wave[idx] = ['grass-plain'];
          }
        }
      }
    }

    const getNeighbors = (idx: number) => {
      const x = idx % width;
      const y = Math.floor(idx / width);
      const neighbors = [];
      if (x > 0) neighbors.push(idx - 1);
      if (x < width - 1) neighbors.push(idx + 1);
      if (y > 0) neighbors.push(idx - width);
      if (y < height - 1) neighbors.push(idx + width);
      return neighbors;
    };

    const propagate = (startIdx: number) => {
      const stack = [startIdx];
      while (stack.length > 0) {
        const curr = stack.pop()!;
        const currOptions = wave[curr];
        
        for (const neighbor of getNeighbors(curr)) {
          if (collapsed[neighbor]) continue;
          
          const neighborOptions = wave[neighbor];
          const nextNeighborOptions = neighborOptions.filter(opt => {
            return currOptions.some(currOpt => rules[currOpt].includes(opt));
          });

          if (nextNeighborOptions.length < neighborOptions.length) {
            wave[neighbor] = nextNeighborOptions;
            stack.push(neighbor);
          }
        }
      }
    };

    // Initial propagation
    for (let i = 0; i < collapsed.length; i++) {
      if (collapsed[i]) propagate(i);
    }

    while (true) {
      let minEntropy = Infinity;
      let targetIdx = -1;
      
      for (let i = 0; i < wave.length; i++) {
        if (collapsed[i]) continue;
        const entropy = wave[i].length;
        if (entropy === 0) continue;
        if (entropy > 1 && entropy < minEntropy) {
          minEntropy = entropy;
          targetIdx = i;
        } else if (entropy > 1 && entropy === minEntropy && Math.random() > 0.5) {
          targetIdx = i;
        }
      }

      if (targetIdx === -1) {
        // Find any uncollapsed cell with options
        for (let i = 0; i < wave.length; i++) {
          if (!collapsed[i] && wave[i].length > 0) {
            targetIdx = i;
            break;
          }
        }
      }

      if (targetIdx === -1) break;

      const options = wave[targetIdx];
      const totalWeight = options.reduce((sum, opt) => sum + weights[opt], 0);
      let r = Math.random() * totalWeight;
      let choice = options[0];
      for (const opt of options) {
        r -= weights[opt];
        if (r <= 0) {
          choice = opt;
          break;
        }
      }

      collapsed[targetIdx] = choice;
      wave[targetIdx] = [choice];
      propagate(targetIdx);
    }

    let added = false;
    for (let i = 0; i < collapsed.length; i++) {
      const x = (i % width) + minX;
      const y = Math.floor(i / width) + minY;
      const key = `${x},${y}`;
      
      if (!currentGrid[key] && !grid[key] && collapsed[i]) {
        const tileType = collapsed[i] as TileType;
        const isTree = tileType.startsWith('tree-');
        const isBuilding = tileType.startsWith('building-');
        newGrid[key] = [{ 
          type: tileType, 
          rotation: (isTree || isBuilding) ? 0 : Math.floor(Math.random() * 4) * 90 
        }];
        added = true;
      }
    }

    if (added && !baseGrid) {
      setGrid(newGrid);
      addToHistory(newGrid);
    }
    return newGrid;
  };

  const generateMap = (density: 'dense' | 'sparse' | 'very-sparse' | 'extremely-sparse' = 'sparse') => {
    // 1. Roads
    const roadGrid = randomRoads(density, grid);
    // 2. Rails
    const railGrid = randomRails('extremely-sparse', roadGrid);
    // 3. Landscaping
    const finalGrid = randomLandscaping(railGrid);
    
    setGrid(finalGrid);
    addToHistory(finalGrid);
  };

  const randomRoads = (density: 'dense' | 'sparse' | 'very-sparse' | 'extremely-sparse' = 'sparse', baseGrid?: GridData) => {
    const newGrid = baseGrid ? { ...baseGrid } : { ...grid };
    
    // 1. Determine Bounds
    let minX: number, minY: number, maxX: number, maxY: number;
    if (selectionStart && selectionEnd) {
      minX = Math.min(selectionStart.x, selectionEnd.x);
      maxX = Math.max(selectionStart.x, selectionEnd.x);
      minY = Math.min(selectionStart.y, selectionEnd.y);
      maxY = Math.max(selectionStart.y, selectionEnd.y);
    } else {
      minX = -8; maxX = 8; minY = -8; maxY = 8;
      const keys = Object.keys(baseGrid || grid);
      if (keys.length > 0) {
        keys.forEach(key => {
          const [x, y] = key.split(',').map(Number);
          minX = Math.min(minX, x - 2);
          maxX = Math.max(maxX, x + 2);
          minY = Math.min(minY, y - 2);
          maxY = Math.max(maxY, y + 2);
        });
      }
    }

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (width <= 0 || height <= 0) return;

    // 2. Generate Skeleton (Infrastructure Map)
    // Values: 'road2', 'road4'
    const skeleton: Record<string, 'road2' | 'road4'> = {};
    
    const getDist = (x1: number, y1: number, x2: number, y2: number) => Math.abs(x1 - x2) + Math.abs(y1 - y2);

    const connectPoints = (p1: {x: number, y: number}, p2: {x: number, y: number}, type: 'road2' | 'road4') => {
      let curr = { ...p1 };
      while (curr.x !== p2.x || curr.y !== p2.y) {
        skeleton[`${curr.x},${curr.y}`] = type;
        const dx = Math.sign(p2.x - curr.x);
        const dy = Math.sign(p2.y - curr.y);
        
        if (curr.x !== p2.x && (curr.y === p2.y || Math.random() > 0.5)) {
          curr.x += dx;
        } else {
          curr.y += dy;
        }
      }
      skeleton[`${p2.x},${p2.y}`] = type;
    };

    // Pick Hubs based on density
    const densityMap = {
      'dense': 20,
      'sparse': 40,
      'very-sparse': 70,
      'extremely-sparse': 100
    };
    const hubs: {x: number, y: number}[] = [];
    const hubCount = Math.max(2, Math.floor((width * height) / densityMap[density]));
    for (let i = 0; i < hubCount; i++) {
      hubs.push({
        x: Math.floor(Math.random() * width) + minX,
        y: Math.floor(Math.random() * height) + minY
      });
    }

    // Connect Hubs in a chain or MST-like fashion
    for (let i = 0; i < hubs.length - 1; i++) {
      const type = Math.random() > 0.5 ? 'road4' : 'road2';
      connectPoints(hubs[i], hubs[i+1], type);
    }

    // Add some random spurs
    hubs.forEach(hub => {
      if (Math.random() > 0.5) {
        const length = Math.floor(Math.random() * 4) + 2;
        const dir = Math.floor(Math.random() * 4);
        const dx = [0, 1, 0, -1][dir];
        const dy = [-1, 0, 1, 0][dir];
        let curr = { ...hub };
        const type = skeleton[`${hub.x},${hub.y}`] || 'road2';
        for (let i = 0; i < length; i++) {
          curr.x += dx;
          curr.y += dy;
          if (curr.x < minX || curr.x > maxX || curr.y < minY || curr.y > maxY) break;
          skeleton[`${curr.x},${curr.y}`] = type;
        }
      }
    });

    // 3. Determine Tile Types and Rotations
    const getNeighbors = (x: number, y: number, type: string) => {
      const n = skeleton[`${x},${y-1}`] === type;
      const e = skeleton[`${x+1},${y}`] === type;
      const s = skeleton[`${x},${y+1}`] === type;
      const w = skeleton[`${x-1},${y}`] === type;
      return [n, e, s, w];
    };

    const resolveTile = (x: number, y: number, infraType: 'road2' | 'road4' | 'rail'): { type: TileType, rotation: number } => {
      const [n, e, s, w] = getNeighbors(x, y, infraType);
      const count = [n, e, s, w].filter(Boolean).length;
      const prefix = infraType === 'rail' ? 'rail' : (infraType === 'road4' ? 'road-4lane' : 'road');

      if (count === 4) return { type: `${prefix}-cross` as TileType, rotation: 0 };
      if (count === 3) {
        if (!n) return { type: `${prefix}-t` as TileType, rotation: 90 };
        if (!e) return { type: `${prefix}-t` as TileType, rotation: 180 };
        if (!s) return { type: `${prefix}-t` as TileType, rotation: 270 };
        return { type: `${prefix}-t` as TileType, rotation: 0 };
      }
      if (count === 2) {
        if (n && s) return { type: `${prefix}-straight` as TileType, rotation: 0 };
        if (e && w) return { type: `${prefix}-straight` as TileType, rotation: 90 };
        if (n && e) return { type: `${prefix}-curve` as TileType, rotation: 90 };
        if (e && s) return { type: `${prefix}-curve` as TileType, rotation: 180 };
        if (s && w) return { type: `${prefix}-curve` as TileType, rotation: 270 };
        if (w && n) return { type: `${prefix}-curve` as TileType, rotation: 0 };
      }
      if (count === 1) {
        if (n) return { type: `${prefix}-end` as TileType, rotation: 180 };
        if (e) return { type: `${prefix}-end` as TileType, rotation: 270 };
        if (s) return { type: `${prefix}-end` as TileType, rotation: 0 };
        if (w) return { type: `${prefix}-end` as TileType, rotation: 90 };
      }
      return { type: `${prefix}-straight` as TileType, rotation: 0 };
    };

    // 4. Apply Infrastructure
    let added = false;
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = `${x},${y}`;
        if (grid[key] || (baseGrid && baseGrid[key])) continue;

        if (skeleton[key]) {
          const { type, rotation } = resolveTile(x, y, skeleton[key]);
          newGrid[key] = [{ type, rotation }];
          added = true;
        }
      }
    }

    if (added && !baseGrid) {
      setGrid(newGrid);
      addToHistory(newGrid);
    }
    return newGrid;
  };

  const randomRails = (density: 'dense' | 'sparse' | 'very-sparse' | 'extremely-sparse' = 'extremely-sparse', baseGrid?: GridData) => {
    const newGrid = baseGrid ? { ...baseGrid } : { ...grid };
    
    // 1. Determine Bounds
    let minX: number, minY: number, maxX: number, maxY: number;
    if (selectionStart && selectionEnd) {
      minX = Math.min(selectionStart.x, selectionEnd.x);
      maxX = Math.max(selectionStart.x, selectionEnd.x);
      minY = Math.min(selectionStart.y, selectionEnd.y);
      maxY = Math.max(selectionStart.y, selectionEnd.y);
    } else {
      minX = -8; maxX = 8; minY = -8; maxY = 8;
      const keys = Object.keys(baseGrid || grid);
      if (keys.length > 0) {
        keys.forEach(key => {
          const [x, y] = key.split(',').map(Number);
          minX = Math.min(minX, x - 2);
          maxX = Math.max(maxX, x + 2);
          minY = Math.min(minY, y - 2);
          maxY = Math.max(maxY, y + 2);
        });
      }
    }

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    if (width <= 0 || height <= 0) return;

    // 2. Generate Skeleton (Infrastructure Map)
    const skeleton: Record<string, 'rail'> = {};
    
    const connectPoints = (p1: {x: number, y: number}, p2: {x: number, y: number}) => {
      let curr = { ...p1 };
      while (curr.x !== p2.x || curr.y !== p2.y) {
        skeleton[`${curr.x},${curr.y}`] = 'rail';
        const dx = Math.sign(p2.x - curr.x);
        const dy = Math.sign(p2.y - curr.y);
        if (curr.x !== p2.x && (curr.y === p2.y || Math.random() > 0.5)) {
          curr.x += dx;
        } else {
          curr.y += dy;
        }
      }
      skeleton[`${p2.x},${p2.y}`] = 'rail';
    };

    // Pick Hubs based on density
    const densityMap = {
      'dense': 20,
      'sparse': 40,
      'very-sparse': 70,
      'extremely-sparse': 100
    };
    const hubs: {x: number, y: number}[] = [];
    const hubCount = Math.max(2, Math.floor((width * height) / densityMap[density]));
    for (let i = 0; i < hubCount; i++) {
      hubs.push({
        x: Math.floor(Math.random() * width) + minX,
        y: Math.floor(Math.random() * height) + minY
      });
    }

    for (let i = 0; i < hubs.length - 1; i++) {
      connectPoints(hubs[i], hubs[i+1]);
    }

    // 3. Determine Tile Types and Rotations
    const getNeighbors = (x: number, y: number) => {
      const n = skeleton[`${x},${y-1}`] === 'rail';
      const e = skeleton[`${x+1},${y}`] === 'rail';
      const s = skeleton[`${x},${y+1}`] === 'rail';
      const w = skeleton[`${x-1},${y}`] === 'rail';
      return [n, e, s, w];
    };

    const resolveTile = (x: number, y: number): { type: TileType, rotation: number } => {
      const [n, e, s, w] = getNeighbors(x, y);
      const count = [n, e, s, w].filter(Boolean).length;
      const prefix = 'rail';

      if (count === 4) return { type: `${prefix}-cross` as TileType, rotation: 0 };
      if (count === 3) {
        if (!n) return { type: `${prefix}-t` as TileType, rotation: 90 };
        if (!e) return { type: `${prefix}-t` as TileType, rotation: 180 };
        if (!s) return { type: `${prefix}-t` as TileType, rotation: 270 };
        return { type: `${prefix}-t` as TileType, rotation: 0 };
      }
      if (count === 2) {
        if (n && s) return { type: `${prefix}-straight` as TileType, rotation: 0 };
        if (e && w) return { type: `${prefix}-straight` as TileType, rotation: 90 };
        if (n && e) return { type: `${prefix}-curve` as TileType, rotation: 90 };
        if (e && s) return { type: `${prefix}-curve` as TileType, rotation: 180 };
        if (s && w) return { type: `${prefix}-curve` as TileType, rotation: 270 };
        if (w && n) return { type: `${prefix}-curve` as TileType, rotation: 0 };
      }
      if (count === 1) {
        if (n) return { type: `${prefix}-end` as TileType, rotation: 180 };
        if (e) return { type: `${prefix}-end` as TileType, rotation: 270 };
        if (s) return { type: `${prefix}-end` as TileType, rotation: 0 };
        if (w) return { type: `${prefix}-end` as TileType, rotation: 90 };
      }
      return { type: `${prefix}-straight` as TileType, rotation: 0 };
    };

    // 4. Apply Rails
    let added = false;
    for (const key in skeleton) {
      const [x, y] = key.split(',').map(Number);
      
      // Never overwrite non-empty cells
      if (grid[key] || (baseGrid && baseGrid[key])) continue;

      const { type, rotation } = resolveTile(x, y);
      newGrid[key] = [{ type, rotation }];
      added = true;
    }

    if (added && !baseGrid) {
      setGrid(newGrid);
      addToHistory(newGrid);
    }
    return newGrid;
  };
  const worldX = (mousePos.x - SIDEBAR_WIDTH - offset.x) / zoom;
  const worldY = (mousePos.y - offset.y) / zoom;
  const gridX = Math.floor(worldX / GRID_SIZE);
  const gridY = Math.floor(worldY / GRID_SIZE);

  const selectedVehiclesList = Array.from(selectedVehicles);
  const activeCountIsMoving = selectedVehiclesList.filter(id => vehicles[id]?.isMoving).length;
  const isMovingActive = selectedVehicles.size > 0 && activeCountIsMoving >= selectedVehicles.size / 2;

  const activeCountTurnAround = selectedVehiclesList.filter(id => vehicles[id]?.turnAroundAtDeadEnd).length;
  const isTurnAroundActive = selectedVehicles.size > 0 && activeCountTurnAround >= selectedVehicles.size / 2;

  const activeCountRandomTurn = selectedVehiclesList.filter(id => vehicles[id]?.randomTurning).length;
  const isRandomTurnActive = selectedVehicles.size > 0 && activeCountRandomTurn >= selectedVehicles.size / 2;

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900 select-none">
      <AnimatePresence>
        {!roomCode && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-10 shadow-2xl max-w-md w-full text-center border border-white/20"
            >
              <div className="bg-blue-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-blue-200">
                <MapIcon className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">GridCity Collaborative</h2>
              <p className="text-slate-500 mb-10 text-lg leading-relaxed">
                Design cities together in real-time. Create a new room or join an existing one.
              </p>

              <div className="space-y-6">
                <div className="space-y-4">
                  <button 
                    onClick={createRoom}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-3"
                  >
                    <Plus className="w-5 h-5" />
                    Create New Room
                  </button>

                  <div className="relative flex items-center py-2">
                    <div className="flex-grow border-t border-slate-100"></div>
                    <span className="flex-shrink mx-4 text-slate-300 text-[10px] font-bold uppercase tracking-[0.2em]">or join existing</span>
                    <div className="flex-grow border-t border-slate-100"></div>
                  </div>

                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="ROOM CODE"
                      value={tempRoomCode}
                      onChange={(e) => setTempRoomCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                      className="flex-1 py-4 px-6 bg-slate-50 border-2 border-slate-100 rounded-2xl text-center text-xl font-black tracking-widest focus:outline-none focus:border-blue-500 transition-all uppercase"
                      maxLength={6}
                    />
                    <button 
                      onClick={joinRoom}
                      disabled={!tempRoomCode.trim()}
                      className="bg-slate-900 text-white px-6 rounded-2xl font-bold hover:bg-slate-800 disabled:opacity-30 transition-all"
                    >
                      Join
                    </button>
                  </div>
                </div>

                {availableRooms.length > 0 && (
                  <div className="mt-6 text-left">
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2 mb-2">Previous Rooms</p>
                     <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                       {availableRooms.map(room => (
                          <div key={room.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-3 hover:border-blue-200 hover:bg-blue-50/50 transition-colors group cursor-pointer" onClick={() => setRoomCode(room.id)}>
                            <div className="flex flex-col items-start px-2">
                              <span className="font-bold text-slate-700 tracking-wider flex items-center">{room.id}</span>
                              {room.updatedAt && <span className="text-[10px] text-slate-400">{new Date(room.updatedAt.toDate()).toLocaleString()}</span>}
                            </div>
                            <button 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                if (window.confirm(`Are you sure you want to delete room ${room.id}?`)) {
                                  deleteDoc(doc(db, 'worlds', room.id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `worlds/${room.id}`));
                                }
                              }} 
                              className="p-2 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                              title="Delete Room"
                            >
                               <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                       ))}
                     </div>
                  </div>
                )}

                {authError && (
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-left relative">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Notice</p>
                    <p className="text-xs text-amber-700 leading-tight pr-6">{authError}</p>
                    <button onClick={() => setAuthError(null)} className="absolute top-3 right-3 text-amber-300 hover:text-amber-500">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Sidebar Palette */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col z-20 shadow-xl">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
              <MapIcon className="w-6 h-6 text-blue-600" />
              GridCity
            </h1>
          </div>

          {roomCode && (
            <div className="flex items-center justify-between bg-blue-50/50 p-2.5 rounded-xl border border-blue-100 mb-4 group transition-all hover:bg-blue-50">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <div className="absolute inset-0 w-2 h-2 rounded-full bg-blue-400 animate-ping opacity-75" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em] leading-none mb-1">Active Room</span>
                  <span className="text-sm font-black text-blue-700 tracking-widest leading-none">{roomCode}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(roomCode);
                    // Optional: add a toast or temporary icon change
                  }}
                  className="p-2 text-blue-400 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
                  title="Copy Room Code"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => setRoomCode(null)}
                  className="p-2 text-blue-400 hover:text-red-500 hover:bg-white rounded-lg transition-all"
                  title="Leave Room"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {quotaExceeded && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl">
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1">Quota Exceeded</p>
              <p className="text-[10px] text-red-500 leading-tight">Firestore free tier limit reached. Collaboration will resume tomorrow.</p>
            </div>
          )}

          {authError && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-xl relative group">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Auth Notice</p>
              <p className="text-[10px] text-amber-500 leading-tight pr-4">{authError}</p>
              <button onClick={() => setAuthError(null)} className="absolute top-2 right-2 text-amber-300 hover:text-amber-500">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

        </div>

        <div className="flex border-b border-slate-100">
          <button 
            onClick={() => setActiveCategory('road')}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeCategory === 'road' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Route className="w-4 h-4 mx-auto mb-1" />
            Roads
          </button>
          <button 
            onClick={() => setActiveCategory('rail')}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeCategory === 'rail' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Train className="w-4 h-4 mx-auto mb-1" />
            Rails
          </button>
          <button 
            onClick={() => setActiveCategory('building')}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeCategory === 'building' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Layers className="w-4 h-4 mx-auto mb-1" />
            Build
          </button>
          <button 
            onClick={() => setActiveCategory('landscape')}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeCategory === 'landscape' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <MapIcon className="w-4 h-4 mx-auto mb-1" />
            Land
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 content-start space-y-6">
          <div className="grid grid-cols-4 gap-2">
            {PALETTE_TILES.filter(t => t.category === activeCategory).map((tile) => (
              <button
                key={tile.type}
                onClick={() => setSelectedTile(tile.type)}
                className={`p-1 rounded-xl border-2 transition-all flex flex-col items-center gap-1 group ${
                  selectedTile === tile.type 
                  ? 'border-blue-500 bg-blue-50 shadow-sm' 
                  : 'border-slate-100 hover:border-slate-300 bg-white'
                }`}
                title={tile.label}
              >
                <div className="bg-slate-50 rounded-lg p-1 group-hover:scale-110 transition-transform">
                  <Tile type={tile.type} size={32} />
                </div>
              </button>
            ))}
          </div>

          {/* Library Section */}
          <div className="pt-4 border-t border-slate-100 flex flex-col pt-0">
            <div className="flex border-b border-slate-100 mt-2 mb-2">
              <button 
                onClick={() => setLibraryTab('layouts')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${libraryTab === 'layouts' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Layouts
              </button>
              <button 
                onClick={() => setLibraryTab('simulations')}
                className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${libraryTab === 'simulations' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Sims
              </button>
            </div>
            
            {libraryTab === 'layouts' ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Layout name..."
                    value={newLayoutName}
                    onChange={(e) => setNewLayoutName(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      saveToLibrary(false);
                    }}
                    disabled={!newLayoutName.trim()}
                    className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-30 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {library.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic text-center py-4">No saved layouts yet</p>
                  ) : (
                    library.map((item, index) => (
                      <div key={index} className="group flex items-center justify-between bg-white border border-slate-100 rounded-lg p-2 hover:border-blue-200 transition-colors">
                        <button 
                          onClick={() => loadFromLibrary(item.data)}
                          className="flex-1 text-left text-xs font-medium text-slate-600 truncate"
                        >
                          {item.name}
                        </button>
                        <button 
                          onClick={() => deleteFromLibrary(item.id, item.name)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Sim name..."
                    value={newSimulationName}
                    onChange={(e) => setNewSimulationName(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500/50"
                  />
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      saveToSimulations();
                    }}
                    disabled={!newSimulationName.trim()}
                    className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 disabled:opacity-30 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                  {simulations.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic text-center py-4">No saved simulations yet</p>
                  ) : (
                    simulations.map((item, index) => (
                      <div key={index} className="group flex items-center justify-between bg-white border border-slate-100 rounded-lg p-2 hover:border-purple-200 transition-colors">
                        <button 
                          onClick={() => loadSimulation(item)}
                          className="flex-1 flex items-center gap-2 text-left text-xs font-medium text-slate-600 truncate"
                        >
                          <PlayCircle className="w-3 h-3 text-purple-400" />
                          <span className="truncate">{item.name}</span>
                        </button>
                        <button 
                          onClick={() => setShowDeleteSimulationConfirm({ id: item.id, name: item.name })}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-3">
          <div className="flex items-center justify-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            <button onClick={undo} disabled={historyIndex === 0} className="p-2 hover:bg-slate-100 rounded-md text-slate-600 disabled:opacity-30 transition-colors" title="Undo"><Undo className="w-4 h-4" /></button>
            <button onClick={redo} disabled={historyIndex === history.length - 1} className="p-2 hover:bg-slate-100 rounded-md text-slate-600 disabled:opacity-30 transition-colors" title="Redo"><Redo className="w-4 h-4" /></button>
            <div className="w-px h-4 bg-slate-200 mx-1" />
            <button onClick={copySelection} disabled={!selectionStart || !selectionEnd} className="p-2 hover:bg-slate-100 rounded-md text-slate-600 disabled:opacity-30 transition-colors" title="Copy (Ctrl+C)"><Copy className="w-4 h-4" /></button>
            <button onClick={cutSelection} disabled={!selectionStart || !selectionEnd} className="p-2 hover:bg-slate-100 rounded-md text-slate-600 disabled:opacity-30 transition-colors" title="Cut (Ctrl+X)"><Scissors className="w-4 h-4" /></button>
            <button onClick={() => { if(clipboard){setIsPasting(true);setSelectedTile(null);} }} disabled={!clipboard} className="p-2 hover:bg-slate-100 rounded-md text-slate-600 disabled:opacity-30 transition-colors" title="Paste (Ctrl+V)"><ClipboardPaste className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setRotation(prev => (prev + 90) % 360)} className="flex items-center justify-center gap-2 py-2 px-3 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              <RotateCcw className="w-3 h-3" />
              Rotate (R)
            </button>
            <button onClick={() => { setSelectedTile(null); setIsPasting(false); }} className={`flex items-center justify-center gap-2 py-2 px-3 border rounded-lg text-xs font-medium transition-colors ${!selectedTile && !isPasting ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
              <MousePointer2 className="w-3 h-3" />
              Select
            </button>
          </div>

          <div className="flex justify-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            <button onClick={() => setShowClearConfirm(true)} className="flex-1 flex justify-center p-2 hover:bg-red-50 text-red-600 rounded-md transition-colors" title="Clear Grid"><Trash2 className="w-4 h-4" /></button>
            <div className="w-px h-4 bg-slate-200 mx-1 self-center" />
            <button onClick={exportGrid} className="flex-1 flex justify-center p-2 hover:bg-slate-100 text-slate-600 rounded-md transition-colors" title="Export JSON"><Download className="w-4 h-4" /></button>
            <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex justify-center p-2 hover:bg-slate-100 text-slate-600 rounded-md transition-colors" title="Import JSON"><Upload className="w-4 h-4" /></button>
          </div>
          <input type="file" ref={fileInputRef} onChange={importGrid} accept=".json" className="hidden" />

          <div className="flex justify-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
            <button onClick={() => setDensityModal({ type: 'map' })} className="flex-1 flex justify-center p-2 hover:bg-blue-50 text-blue-600 rounded-md transition-colors" title="Generate Full Map"><MapIcon className="w-4 h-4" /></button>
            <div className="w-px h-4 bg-slate-200 mx-1 self-center" />
            <button onClick={() => setDensityModal({ type: 'road' })} className="flex-1 flex justify-center p-2 hover:bg-slate-100 text-slate-600 rounded-md transition-colors" title="Random Roads"><Route className="w-4 h-4" /></button>
            <button onClick={() => setDensityModal({ type: 'rail' })} className="flex-1 flex justify-center p-2 hover:bg-slate-100 text-slate-600 rounded-md transition-colors" title="Random Rails"><Train className="w-4 h-4" /></button>
            <button onClick={() => randomLandscaping()} className="flex-1 flex justify-center p-2 hover:bg-emerald-50 text-emerald-600 rounded-md transition-colors" title="Auto-Landscape"><Trees className="w-4 h-4" /></button>
          </div>

          <button onClick={() => setShowInfo(true)} className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors">
            <Info className="w-3 h-3" />
            Help Guide
          </button>
        </div>
      </div>

      {/* Main Viewport */}
      <div 
        ref={containerRef}
        className={`flex-1 relative overflow-hidden cursor-${isPanning ? 'grabbing' : selectedTile ? 'crosshair' : 'grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleGridClick}
      >
        {/* Grid Background */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: showGridLines ? `
              linear-gradient(to right, #93c5fd 1px, transparent 1px),
              linear-gradient(to bottom, #93c5fd 1px, transparent 1px)
            ` : 'none',
            backgroundSize: `${GRID_SIZE * zoom}px ${GRID_SIZE * zoom}px`,
            backgroundPosition: `${offset.x}px ${offset.y}px`
          }}
        />

        {/* Tiles Layer */}
        <div 
          className="absolute origin-top-left"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`
          }}
        >
          {(Object.entries(grid) as [string, GridTile[]][]).map(([key, tiles]) => {
            const [x, y] = key.split(',').map(Number);
            return (
              <div 
                key={key}
                className="absolute"
                style={{
                  left: x * GRID_SIZE,
                  top: y * GRID_SIZE,
                  width: GRID_SIZE,
                  height: GRID_SIZE
                }}
              >
                {tiles.map((tile, i) => (
                  <div key={i} className="absolute inset-0">
                    <Tile type={tile.type} rotation={tile.rotation} size={GRID_SIZE} />
                  </div>
                ))}
              </div>
            );
          })}

          {/* Vehicles */}
          <AnimatePresence>
            {(Object.values(vehicles) as Vehicle[])
              .sort((a, b) => {
                if (a.type === 'train' && b.type !== 'train') return 1;
                if (a.type !== 'train' && b.type === 'train') return -1;
                return 0;
              })
              .map((v) => {
              const currentTiles = grid[`${v.x},${v.y}`];
              const currentTile = currentTiles?.find(t => {
                const isBridge = t.type.includes('bridge') || t.type.includes('trestle');
                return (v.zIndex === 1 && isBridge) || (v.zIndex === 0 && !isBridge);
              });
              
              let exitHeading = v.heading;
              if (currentTile) {
                const ports = (TILE_CONNECTIONS[currentTile.type] || []).map(p => (p + currentTile.rotation / 90) % 4);
                const entryPort = (v.heading / 90 + 2) % 4;
                const otherPorts = ports.filter(p => p !== entryPort);
                
                if (otherPorts.length > 0) {
                  let exitPort = otherPorts[0];
                  if (otherPorts.length > 1) {
                    const straightPort = (entryPort + 2) % 4;
                    const leftPort = (entryPort + 3) % 4;
                    const rightPort = (entryPort + 1) % 4;

                    if (v.turnIntent === 'left' && otherPorts.includes(leftPort)) exitPort = leftPort;
                    else if (v.turnIntent === 'right' && otherPorts.includes(rightPort)) exitPort = rightPort;
                    else if (otherPorts.includes(straightPort)) exitPort = straightPort;
                  }
                  exitHeading = exitPort * 90;
                }
              }
              
              return (
                <div key={v.id}>
                  {selectedVehicles.has(v.id) && (
                    <div 
                      className="absolute border-2 border-yellow-400 rounded-full z-20 pointer-events-none"
                      style={{
                        left: v.x * GRID_SIZE - 2,
                        top: v.y * GRID_SIZE - 2,
                        width: GRID_SIZE + 4,
                        height: GRID_SIZE + 4,
                        opacity: 0.8
                      }}
                    />
                  )}
                  <VehicleComponent 
                    {...v} 
                    tileType={currentTile?.type}
                    tileRotation={currentTile?.rotation}
                    exitHeading={exitHeading}
                  />
                </div>
              );
            })}
          </AnimatePresence>

          {/* Paste Preview */}
          {isPasting && clipboard && pastePreviewPos && (
            <div className="pointer-events-none opacity-60">
              {(Object.entries(clipboard) as [string, GridTile[]][]).map(([relKey, tiles]) => {
                const [rx, ry] = relKey.split(',').map(Number);
                return (
                  <div 
                    key={relKey}
                    className="absolute"
                    style={{
                      left: (pastePreviewPos.x + rx - getClipboardOffset().x) * GRID_SIZE,
                      top: (pastePreviewPos.y + ry - getClipboardOffset().y) * GRID_SIZE,
                      width: GRID_SIZE,
                      height: GRID_SIZE
                    }}
                  >
                    {tiles.map((tile, i) => (
                      <div key={i} className="absolute inset-0">
                        <Tile type={tile.type} rotation={tile.rotation} size={GRID_SIZE} />
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
          {/* Selection Box */}
          {selectionStart && selectionEnd && (
            <div 
              className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none z-10"
              style={{
                left: Math.min(selectionStart.x, selectionEnd.x) * GRID_SIZE,
                top: Math.min(selectionStart.y, selectionEnd.y) * GRID_SIZE,
                width: (Math.abs(selectionStart.x - selectionEnd.x) + 1) * GRID_SIZE,
                height: (Math.abs(selectionStart.y - selectionEnd.y) + 1) * GRID_SIZE,
              }}
            />
          )}
        </div>

        {/* Selected Tile Preview Follower */}
        {selectedTile && !isPanning && (
          <div 
            className="absolute pointer-events-none opacity-40 z-10"
            style={{
              left: gridX * GRID_SIZE * zoom + offset.x,
              top: gridY * GRID_SIZE * zoom + offset.y,
              width: GRID_SIZE * zoom,
              height: GRID_SIZE * zoom,
            }}
          >
            <Tile type={selectedTile} rotation={rotation} size={GRID_SIZE * zoom} />
          </div>
        )}

        {/* Paste Preview Follower */}
        {isPasting && clipboard && !isPanning && (
          <div 
            className="absolute pointer-events-none opacity-40 z-10"
            style={{
              left: (gridX - getClipboardOffset().x) * GRID_SIZE * zoom + offset.x,
              top: (gridY - getClipboardOffset().y) * GRID_SIZE * zoom + offset.y,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left'
            }}
          >
            {(Object.entries(clipboard) as [string, GridTile[]][]).map(([relKey, tiles]) => {
              const [rx, ry] = relKey.split(',').map(Number);
              return (
                <div 
                  key={relKey}
                  className="absolute"
                  style={{
                    left: rx * GRID_SIZE,
                    top: ry * GRID_SIZE,
                    width: GRID_SIZE,
                    height: GRID_SIZE
                  }}
                >
                  {tiles.map((tile, i) => (
                    <div key={i} className="absolute inset-0">
                      <Tile type={tile.type} rotation={tile.rotation} size={GRID_SIZE} />
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Floating Controls */}
        <div className="absolute bottom-8 right-8 flex flex-col gap-2">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 flex flex-col gap-1">
            <a 
              href="https://console.firebase.google.com/project/gen-lang-client-0324544485/firestore/databases/ai-studio-fa3f03dd-c38d-413b-92db-5e11a2c39a73/data"
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-xl transition-colors text-slate-400 hover:text-orange-500 hover:bg-orange-50 flex items-center justify-center"
              title="Open Firebase Console"
            >
              <Database className="w-5 h-5" />
            </a>
            <div className="h-px bg-slate-100 mx-2" />
            <button 
              onClick={() => setShowGridLines(!showGridLines)}
              className={`p-3 rounded-xl transition-colors ${showGridLines ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Toggle Grid Lines"
            >
              <Grid className="w-5 h-5" />
            </button>
            <div className="h-px bg-slate-100 mx-2" />
            <button 
              onClick={() => setZoom(z => Math.min(MAX_ZOOM, z * 1.2))}
              className="p-3 hover:bg-slate-50 rounded-xl transition-colors text-slate-600"
              title="Zoom In"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <div className="h-px bg-slate-100 mx-2" />
            <button 
              onClick={() => setZoom(z => Math.max(MIN_ZOOM, z / 1.2))}
              className="p-3 hover:bg-slate-50 rounded-xl transition-colors text-slate-600"
              title="Zoom Out"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <div className="h-px bg-slate-100 mx-2" />
            <button 
              onClick={() => {
                setZoom(INITIAL_ZOOM);
                setOffset({ x: 0, y: 0 });
              }}
              className="p-3 hover:bg-slate-50 rounded-xl transition-colors text-slate-600"
              title="Reset View"
            >
              <Hand className="w-5 h-5" />
            </button>
            <div className="h-px bg-slate-100 mx-2" />
            <button 
              onClick={() => setShowCarManager(!showCarManager)}
              className={`p-3 rounded-xl transition-colors ${showCarManager ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Car Manager"
            >
              <CarFront className="w-5 h-5" />
            </button>
          </div>
          
          <div className="bg-white rounded-full shadow-2xl border border-slate-200 p-3 flex items-center justify-center text-slate-400 text-xs font-bold">
            {Math.round(zoom * 100)}%
          </div>
        </div>

        {/* Car Manager Side Panel */}
        <AnimatePresence>
          {showCarManager && (
            <motion.div
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="absolute right-0 top-0 bottom-0 w-80 bg-white/95 backdrop-blur-md shadow-2xl border-l border-slate-200 z-[100] flex flex-col"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 text-indigo-500 rounded-xl">
                    <Car className="w-5 h-5" />
                  </div>
                  <h2 className="font-bold text-slate-800">Car Manager</h2>
                </div>
                <button 
                  onClick={() => setShowCarManager(false)}
                  className="p-2 hover:bg-slate-50 text-slate-400 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1">
                    <input 
                      type="number" 
                      ref={addCarsCountRef}
                      defaultValue={1}
                      min={1}
                      max={50}
                      className="w-20 p-2 text-sm border border-slate-200 rounded-xl outline-none focus:border-indigo-500"
                    />
                    <span className="text-sm font-medium text-slate-600">Count</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => addRandomCars('car')}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-2 px-2 text-xs font-semibold transition-colors disabled:opacity-50"
                      disabled={!roomCode}
                    >
                      + Car
                    </button>
                    <button 
                      onClick={() => addRandomCars('semi')}
                      className="flex-1 bg-amber-600 hover:bg-amber-700 text-white rounded-xl py-2 px-2 text-xs font-semibold transition-colors disabled:opacity-50"
                      disabled={!roomCode}
                    >
                      + Semi
                    </button>
                    <button 
                      onClick={() => addRandomCars('train')}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2 px-2 text-xs font-semibold transition-colors disabled:opacity-50"
                      disabled={!roomCode}
                    >
                      + Train
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between px-2">
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={Object.keys(vehicles).length > 0 && selectedVehicles.size === Object.keys(vehicles).length}
                        onChange={toggleAllCars}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                      />
                      Select All ({selectedVehicles.size}/{Object.keys(vehicles).length})
                    </label>
                    <button
                      onClick={() => {
                        const newSelection = new Set<string>();
                        Object.keys(vehicles).forEach(id => {
                          if (!selectedVehicles.has(id)) newSelection.add(id);
                        });
                        setSelectedVehicles(newSelection);
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-700 text-left underline underline-offset-2 ml-5 transition-colors"
                    >
                      Invert Selection
                    </button>
                  </div>
                  <button 
                    onClick={removeSelectedCars}
                    disabled={selectedVehicles.size === 0 || !roomCode}
                    className="text-red-500 hover:text-red-600 disabled:opacity-30 disabled:pointer-events-none p-1 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                    title="Remove Selected"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex-1 bg-white border border-slate-100 rounded-2xl overflow-y-auto shadow-inner flex flex-col min-h-[200px]">
                  {(Object.values(vehicles) as Vehicle[]).map((v) => (
                    <label key={v.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 border-b border-slate-50 cursor-pointer">
                      <input 
                        type="checkbox"
                        checked={selectedVehicles.has(v.id)}
                        onChange={(e) => {
                          const newSet = new Set(selectedVehicles);
                          if (e.target.checked) newSet.add(v.id);
                          else newSet.delete(v.id);
                          setSelectedVehicles(newSet);
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                      />
                      <div className="w-4 h-4 rounded-full shadow-inner" style={{ backgroundColor: v.color }} />
                      <span className="text-xs font-mono text-slate-500">{v.id}</span>
                    </label>
                  ))}
                  {Object.keys(vehicles).length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
                      No cars active
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-col gap-4">
                <button 
                  disabled={selectedVehicles.size === 0 || !roomCode}
                  onClick={distributeSelectedCars}
                  className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-40 w-full shadow-sm"
                >
                  Distribute Randomly
                </button>
                
                {Array.from(selectedVehicles).some(id => vehicles[id]?.type === 'semi') && (
                  <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-sm font-medium text-slate-700">Trailers (max 2)</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => changeSelectedTrailers(-1)}
                        disabled={!roomCode}
                        className="w-8 h-8 flex justify-center items-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors"
                      >-</button>
                      <button
                        onClick={() => changeSelectedTrailers(1)}
                        disabled={!roomCode}
                        className="w-8 h-8 flex justify-center items-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors"
                      >+</button>
                    </div>
                  </div>
                )}

                {Array.from(selectedVehicles).some(id => vehicles[id]?.type === 'train') && (
                  <div className="flex flex-col gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <span className="text-sm font-medium text-slate-700">Railcars (max 12)</span>
                    {selectedVehicles.size === 1 && vehicles[Array.from(selectedVehicles)[0]]?.railcars && vehicles[Array.from(selectedVehicles)[0]]!.railcars!.length > 0 && (
                      <div className="flex flex-col gap-1 mb-2">
                        {vehicles[Array.from(selectedVehicles)[0]]!.railcars!.map((rt, i) => (
                           <div key={i} className="flex justify-between items-center text-xs bg-slate-50 p-1 px-2 rounded border border-slate-100">
                             <span className="font-mono text-slate-600 capitalize">{i+1}. {rt.replace('-', ' ')}</span>
                             <div className="flex gap-2">
                               <button onClick={() => modifySelectedRailcars('move', {from: i, to: i-1})} disabled={i === 0 || !roomCode} className="hover:text-slate-900 disabled:opacity-30">▲</button>
                               <button onClick={() => modifySelectedRailcars('move', {from: i, to: i+1})} disabled={i === vehicles[Array.from(selectedVehicles)[0]]!.railcars!.length - 1 || !roomCode} className="hover:text-slate-900 disabled:opacity-30">▼</button>
                               <button onClick={() => modifySelectedRailcars('remove', i)} disabled={!roomCode} className="text-red-500 hover:text-red-600 ml-2 disabled:opacity-30"><Trash2 className="w-3 h-3" /></button>
                             </div>
                           </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {(['passenger', 'flatbed', 'boxcar', 'container', 'closed-hopper', 'open-hopper', 'tank'] as RailcarType[]).map(rt => (
                        <button
                          key={rt}
                          onClick={() => modifySelectedRailcars('add', rt)}
                          disabled={!roomCode || (Array.from(selectedVehicles).length > 0 && (vehicles[Array.from(selectedVehicles)[0]]?.railcars?.length || 0) >= 12)}
                          className="px-2 py-1 text-[10px] uppercase font-bold rounded border border-indigo-100 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors disabled:opacity-50"
                        >
                          + {rt.replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-sm font-medium text-slate-700 w-12">Speed</span>
                  <input 
                    type="range" 
                    min="0.5" 
                    max="5" 
                    step="0.5"
                    disabled={selectedVehicles.size === 0 || !roomCode}
                    value={selectedVehicles.size > 0 ? (vehicles[Array.from(selectedVehicles)[0]]?.speed || 1) : 1}
                    onChange={(e) => changeSelectedCarsSpeed(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xs font-bold text-slate-400 w-8 text-right">
                    {selectedVehicles.size > 0 ? (vehicles[Array.from(selectedVehicles)[0]]?.speed || 1).toFixed(1) : '-'}x
                  </span>
                </div>

                <div className="flex flex-col gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <label className={`flex items-center justify-between cursor-pointer ${selectedVehicles.size === 0 ? 'opacity-40' : ''}`}>
                    <span className="text-sm font-medium text-slate-700">Go / Stop</span>
                    <button 
                      type="button"
                      disabled={selectedVehicles.size === 0 || !roomCode}
                      onClick={() => toggleSelectedCarsAttribute('isMoving')}
                      className={`w-[44px] h-[24px] rounded-full p-1 transition-colors flex items-center ${isMovingActive ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isMovingActive ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                    </button>
                  </label>

                  <label className={`flex items-center justify-between cursor-pointer ${selectedVehicles.size === 0 ? 'opacity-40' : ''}`}>
                    <span className="text-sm font-medium text-slate-700">Turn around at end</span>
                    <button 
                      type="button"
                      disabled={selectedVehicles.size === 0 || !roomCode}
                      onClick={() => toggleSelectedCarsAttribute('turnAroundAtDeadEnd')}
                      className={`w-[44px] h-[24px] rounded-full p-1 transition-colors flex items-center ${isTurnAroundActive ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isTurnAroundActive ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                    </button>
                  </label>

                  <label className={`flex items-center justify-between cursor-pointer ${selectedVehicles.size === 0 ? 'opacity-40' : ''}`}>
                    <span className="text-sm font-medium text-slate-700">Random Turns</span>
                    <button 
                      type="button"
                      disabled={selectedVehicles.size === 0 || !roomCode}
                      onClick={() => toggleSelectedCarsAttribute('randomTurning')}
                      className={`w-[44px] h-[24px] rounded-full p-1 transition-colors flex items-center ${isRandomTurnActive ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isRandomTurnActive ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                    </button>
                  </label>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <label className={`flex items-center justify-between cursor-pointer`}>
                    <span className="text-sm font-medium text-slate-700">Place Cars (Click Grid)</span>
                    <button 
                      type="button"
                      disabled={!roomCode}
                      onClick={() => setIsPlacingVehicles(!isPlacingVehicles)}
                      className={`w-[44px] h-[24px] rounded-full p-1 transition-colors flex items-center ${isPlacingVehicles ? 'bg-orange-500' : 'bg-slate-300'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isPlacingVehicles ? 'translate-x-[20px]' : 'translate-x-0'}`} />
                    </button>
                  </label>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

          {/* Modals */}
          <AnimatePresence>
            {showDeleteSimulationConfirm && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl max-w-sm w-full text-center"
                >
                  <div className="bg-red-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Trash2 className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Simulation?</h3>
                  <p className="text-slate-500 mb-8 leading-relaxed">
                    Are you sure you want to delete <span className="font-bold text-slate-700">"{showDeleteSimulationConfirm.name}"</span>? This action cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowDeleteSimulationConfirm(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={confirmDeleteSimulation}
                      className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {showSaveSimulationConfirm && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl max-w-sm w-full text-center"
                >
                  <div className="bg-purple-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Save className="w-8 h-8 text-purple-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Save Simulation?</h3>
                  <p className="text-slate-500 mb-8">
                    Your Simulation name is active. Would you like to save it?
                  </p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowSaveSimulationConfirm(false)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        saveToSimulations();
                        setShowSaveSimulationConfirm(false);
                      }}
                      className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {showDeleteLayoutConfirm && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl max-w-sm w-full text-center"
                >
                  <div className="bg-red-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Trash2 className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Layout?</h3>
                  <p className="text-slate-500 mb-8 leading-relaxed">
                    Are you sure you want to delete <span className="font-bold text-slate-700">"{showDeleteLayoutConfirm.name}"</span>? This action cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowDeleteLayoutConfirm(null)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={confirmDeleteFromLibrary}
                      className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
            {showClearConfirm && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl max-w-sm w-full text-center"
                >
                  <div className="bg-red-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Trash2 className="w-8 h-8 text-red-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    {selectionStart && selectionEnd ? 'Clear Selection?' : 'Clear Grid?'}
                  </h3>
                  <p className="text-slate-500 mb-8">
                    {selectionStart && selectionEnd 
                      ? 'This will permanently delete all tiles within the selected area.' 
                      : 'This will permanently delete all tiles in the current grid. This action cannot be undone.'}
                  </p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowClearConfirm(false)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        if (selectionStart && selectionEnd) {
                          deleteSelection();
                        } else {
                          clearGrid();
                        }
                        setShowClearConfirm(false);
                      }}
                      className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
                    >
                      Clear {selectionStart && selectionEnd ? 'Selection' : 'All'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {showSaveConfirm && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl max-w-sm w-full text-center"
                >
                  <div className="bg-blue-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Save className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Save Entire Grid?</h3>
                  <p className="text-slate-500 mb-8">
                    You don't have a selection active. Would you like to save the entire layout to your library?
                  </p>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setShowSaveConfirm(false)}
                      className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => {
                        saveToLibrary(true);
                        setShowSaveConfirm(false);
                      }}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
                    >
                      Save All
                    </button>
                  </div>
                </motion.div>
              </div>
            )}

            {showLoadConfirm && pendingLayout && (
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-2xl max-w-sm w-full text-center"
                >
                  <div className="bg-blue-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <ClipboardPaste className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Load Layout</h3>
                  <p className="text-slate-500 mb-8">
                    Would you like to replace your entire city with this layout, or paste it into your existing city?
                  </p>
                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => {
                        setGrid(pendingLayout);
                        addToHistory(pendingLayout);
                        setShowLoadConfirm(false);
                        setPendingLayout(null);
                      }}
                      className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
                    >
                      Replace Entire Layout
                    </button>
                    <button 
                      onClick={() => {
                        setClipboard(pendingLayout);
                        setIsPasting(true);
                        setSelectedTile(null);
                        setShowLoadConfirm(false);
                        setPendingLayout(null);
                      }}
                      className="w-full py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                    >
                      Paste into Existing
                    </button>
                    <button 
                      onClick={() => {
                        setShowLoadConfirm(false);
                        setPendingLayout(null);
                      }}
                      className="w-full py-2 text-slate-400 text-xs hover:text-slate-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              </div>
            )}


          {densityModal.type && (
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white border border-slate-200 rounded-3xl p-8 shadow-2xl max-w-sm w-full relative"
              >
                <button 
                  onClick={() => setDensityModal({ type: null })}
                  className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
                <h3 className="text-2xl font-bold mb-2 flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-xl">
                    {densityModal.type === 'road' ? <Route className="w-6 h-6 text-blue-600" /> : <Train className="w-6 h-6 text-blue-600" />}
                  </div>
                  Generation Density
                </h3>
                <p className="text-slate-500 text-sm mb-6">Choose how dense you want the {densityModal.type} network to be.</p>
                
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { id: 'dense', label: 'Dense', desc: 'Maximum connectivity, urban feel' },
                    { id: 'sparse', label: 'Sparse', desc: 'Balanced network, suburban feel' },
                    { id: 'very-sparse', label: 'Very Sparse', desc: 'Few connections, rural feel' },
                    { id: 'extremely-sparse', label: 'Extremely Sparse', desc: 'Minimal network, isolated feel' }
                  ].map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        if (densityModal.type === 'road') randomRoads(d.id as any);
                        else if (densityModal.type === 'rail') randomRails(d.id as any);
                        else if (densityModal.type === 'map') generateMap(d.id as any);
                        setDensityModal({ type: null });
                      }}
                      className="flex flex-col items-start p-4 border-2 border-slate-100 rounded-2xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                    >
                      <span className="font-bold text-slate-800 group-hover:text-blue-700">{d.label}</span>
                      <span className="text-xs text-slate-500">{d.desc}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            </div>
          )}

          {showInfo && (
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white border border-slate-200 rounded-3xl p-8 shadow-2xl max-w-md w-full relative"
              >
                <button 
                  onClick={() => setShowInfo(false)}
                  className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
                <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-xl">
                    <Info className="w-6 h-6 text-blue-600" />
                  </div>
                  How to Design
                </h3>
                <ul className="space-y-4 text-slate-600">
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">CLICK</div>
                    <p>Place the selected tile on the grid.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">ALT+DRAG</div>
                    <p>Select a region of tiles.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">CTRL+C/X/V</div>
                    <p>Copy, Cut, and Paste selected regions.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">CTRL+Z/Y</div>
                    <p>Undo and Redo your actions.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">SHIFT+CLICK</div>
                    <p>Remove a tile from the grid.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">DRAG</div>
                    <p>Pan around the infinite grid.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">SCROLL</div>
                    <p>Zoom in and out of your design.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-slate-100 px-2 py-1 rounded text-xs font-bold text-slate-500 mt-0.5">R KEY</div>
                    <p>Rotate the selected tile by 90 degrees.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-blue-100 px-2 py-1 rounded text-xs font-bold text-blue-500 mt-0.5">G / S</div>
                    <p>Drive vehicle continuously (G) or Stop (S).</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-blue-100 px-2 py-1 rounded text-xs font-bold text-blue-500 mt-0.5">UP / DOWN</div>
                    <p>Accelerate or Decelerate vehicle.</p>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="bg-blue-100 px-2 py-1 rounded text-xs font-bold text-blue-500 mt-0.5">L / R</div>
                    <p>Turn at intersections, or change lanes on 4-lane roads.</p>
                  </li>
                </ul>
                <button 
                  onClick={() => setShowInfo(false)}
                  className="mt-8 w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
                >
                  Start Building
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
