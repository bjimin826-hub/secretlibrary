import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  addDoc, 
  deleteDoc, 
  updateDoc 
} from 'firebase/firestore';
import { 
  Search, Tag, ExternalLink, Plus, Edit2, Trash2, Heart, 
  Sparkles, ShieldCheck, Lock, X, RefreshCw, SlidersHorizontal, 
  BookOpen, Star, User, Tv, Upload, MessageCircleHeart, 
  CheckCircle2, Flame, FolderTab, LogIn, LogOut, UserPlus,
  Layers, Check, Eye
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "demo-api-key",
      authDomain: "demo-app.firebaseapp.com",
      projectId: "demo-app",
      storageBucket: "demo-app.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123456789:web:abcdef"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'bl-curation-app';

// 기본 태그 및 플랫폼 목록
const PLATFORM_LIST = ['봄툰', '레진코믹스', '리디북스', '미스터블루', '카카오페이지', '네이버웹툰'];
const DEFAULT_KEYWORDS = [
  '오메가버스', '캠퍼스물', '집착공', '후회공', '다정공', 
  '연하공', '연상수', '단정수', '판타지', '현대물', 
  '복수물', '구원물', '배틀호모', '짝사랑수', '달달물', '강수'
];

export default function App() {
  // 인증 및 사용자 상태
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null); // { username, isAdmin, nickname }
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'
  
  // 파판14 스타일 ID/PW 회원가입 필드
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nicknameInput, setNicknameInput] = useState('');
  const [authError, setAuthError] = useState('');

  // 웹툰 관리 모달 및 선택 상태
  const [selectedWebtoon, setSelectedWebtoon] = useState(null);
  const [editingWebtoon, setEditingWebtoon] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // 토스트 메시지 헬퍼
  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
  };

  // 실시간 웹툰 데이터 (초기 상태: 0개 빈 클린 상태)
  const [webtoons, setWebtoons] = useState([]);
  const [loading, setLoading] = useState(true);

  // 브라우징 탭 & 필터 상태
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'keywords' | 'authors' | 'platforms'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [selectedAuthor, setSelectedAuthor] = useState('ALL');
  const [selectedPlatform, setSelectedPlatform] = useState('ALL');
  const [sortBy, setSortBy] = useState('latest');

  // 1. Auth 및 로컬 세션 초기화
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth init error:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // 저장된 사용자 세션 로드
      const savedSession = localStorage.getItem('bl_portal_session');
      if (savedSession) {
        try {
          const parsedSession = JSON.parse(savedSession);
          setUserProfile(parsedSession);
        } catch (e) {
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Real-time Firestore Sync (실시간으로 친구에게 업데이트 반영)
  useEffect(() => {
    if (!user) return;

    const webtoonsColRef = collection(db, 'artifacts', appId, 'public', 'data', 'webtoons');

    const unsubscribe = onSnapshot(
      webtoonsColRef,
      (snapshot) => {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setWebtoons(items);
        setLoading(false);
      },
      (error) => {
        console.error("Firestore sync error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // 작가 목록 계산
  const authorList = useMemo(() => {
    const authors = webtoons.map(w => w.author).filter(Boolean);
    return ['ALL', ...Array.from(new Set(authors))];
  }, [webtoons]);

  // 키워드 조합 계산
  const allKeywords = useMemo(() => {
    const set = new Set(DEFAULT_KEYWORDS);
    webtoons.forEach(w => {
      if (w.keywords) w.keywords.forEach(k => set.add(k));
    });
    return Array.from(set);
  }, [webtoons]);

  // 필터링 및 정렬
  const filteredWebtoons = useMemo(() => {
    return webtoons.filter(item => {
      const query = searchTerm.toLowerCase().trim();
      const matchesSearch = !query || 
        item.title?.toLowerCase().includes(query) ||
        item.author?.toLowerCase().includes(query) ||
        item.friendReview?.toLowerCase().includes(query) ||
        (item.keywords && item.keywords.some(k => k.toLowerCase().includes(query)));

      const matchesKeywords = selectedKeywords.length === 0 ||
        (item.keywords && selectedKeywords.every(kw => item.keywords.includes(kw)));

      const matchesAuthor = selectedAuthor === 'ALL' || item.author === selectedAuthor;
      const matchesPlatform = selectedPlatform === 'ALL' || item.platform === selectedPlatform;

      return matchesSearch && matchesKeywords && matchesAuthor && matchesPlatform;
    }).sort((a, b) => {
      if (sortBy === 'latest') return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      if (sortBy === 'popular') return (b.likes || 0) - (a.likes || 0);
      return 0;
    });
  }, [webtoons, searchTerm, selectedKeywords, selectedAuthor, selectedPlatform, sortBy]);

  // ID/PW 방식 로그인 및 회원가입 핸들러
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');

    const targetUsername = usernameInput.trim();
    const targetPassword = passwordInput.trim();

    if (!targetUsername || !targetPassword) {
      setAuthError('아이디와 비밀번호를 모두 입력해주세요.');
      return;
    }

    try {
      const usersData = JSON.parse(localStorage.getItem('bl_portal_users') || '[]');

      if (authMode === 'signup') {
        const existingUser = usersData.find(u => u.username === targetUsername);
        if (existingUser) {
          setAuthError('이미 존재하는 아이디입니다.');
          return;
        }

        const isFirstUser = usersData.length === 0;
        const newUser = {
          username: targetUsername,
          password: targetPassword,
          nickname: nicknameInput.trim() || targetUsername,
          isAdmin: isFirstUser
        };

        usersData.push(newUser);
        localStorage.setItem('bl_portal_users', JSON.stringify(usersData));

        const profileData = {
          username: newUser.username,
          nickname: newUser.nickname,
          isAdmin: newUser.isAdmin
        };
        setUserProfile(profileData);
        localStorage.setItem('bl_portal_session', JSON.stringify(profileData));

        showToast(isFirstUser ? "회원가입 완료! 첫 번째 회원으로 '운영자' 권한이 부여되었습니다." : "회원가입이 완료되었습니다!");
      } else {
        const userMatch = usersData.find(u => u.username === targetUsername && u.password === targetPassword);
        if (!userMatch) {
          setAuthError('아이디 또는 비밀번호가 일치하지 않습니다.');
          return;
        }

        const profileData = {
          username: userMatch.username,
          nickname: userMatch.nickname || userMatch.username,
          isAdmin: !!userMatch.isAdmin
        };
        setUserProfile(profileData);
        localStorage.setItem('bl_portal_session', JSON.stringify(profileData));

        showToast(`${profileData.nickname}님, 환영합니다!`);
      }

      setShowAuthModal(false);
      setUsernameInput('');
      setPasswordInput('');
      setNicknameInput('');
    } catch (err) {
      console.error("Auth error:", err);
      setAuthError('인증 처리 중 오류가 발생했습니다.');
    }
  };

  // 로그아웃
  const handleSignOut = async () => {
    localStorage.removeItem('bl_portal_session');
    setUserProfile(null);
    showToast("로그아웃 되었습니다.");
  };

  // 관리자 권한 토글 (테스트 체험용)
  const toggleAdminPermission = () => {
    if (!userProfile) {
      setShowAuthModal(true);
      return;
    }
    const updatedStatus = !userProfile.isAdmin;
    const updatedProfile = { ...userProfile, isAdmin: updatedStatus };
    setUserProfile(updatedProfile);
    localStorage.setItem('bl_portal_session', JSON.stringify(updatedProfile));
    showToast(updatedStatus ? "👑 관리자 권한이 활성화되었습니다!" : "일반 사용자 모드로 전환되었습니다.");
  };

  // 웹툰 좋아요 증가
  const handleLike = async (e, id, currentLikes = 0) => {
    e.stopPropagation();
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'webtoons', id);
      await updateDoc(docRef, { likes: currentLikes + 1 });
      showToast("❤️ 추천작에 하트를 남겼습니다!");
    } catch (err) {
      console.error("Like update error:", err);
    }
  };

  // 웹툰 삭제 (관리자 전용)
  const handleDeleteWebtoon = async (id, title) => {
    if (!userProfile?.isAdmin) return;
    if (window.confirm(`'${title}' 추천작을 정말 삭제하시겠습니까? (친구들 화면에서도 실시간 삭제됩니다)`)) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'webtoons', id));
        if (selectedWebtoon?.id === id) setSelectedWebtoon(null);
        showToast("삭제가 반영되었습니다.");
      } catch (err) {
        console.error("Delete error:", err);
      }
    }
  };

  // 웹툰 신규 저장 및 수정 (관리자 전용)
  const handleSaveWebtoon = async (formData) => {
    if (!userProfile?.isAdmin) return;

    try {
      if (editingWebtoon?.id) {
        // 수정
        const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'webtoons', editingWebtoon.id);
        await updateDoc(docRef, {
          ...formData,
          updatedAt: Date.now()
        });
        showToast("수정 내역이 친구들에게 실시간 반영되었습니다!");
      } else {
        // 신규 등록
        const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'webtoons');
        await addDoc(colRef, {
          ...formData,
          likes: 0,
          createdAt: Date.now()
        });
        showToast("✨ 새로운 추천 웹툰이 실시간 업데이트 되었습니다!");
      }
      setEditModalOpen(false);
      setEditingWebtoon(null);
    } catch (err) {
      console.error("Save webtoon error:", err);
      showToast("저장 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-800 font-sans selection:bg-blue-200 selection:text-blue-900">
      
      {/* 1. 상단 타이틀 헤더 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-blue-100/80 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* 브랜드 로고 */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-600 to-sky-400 flex items-center justify-center shadow-md shadow-blue-500/20">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight bg-gradient-to-r from-blue-950 via-indigo-900 to-blue-700 bg-clip-text text-transparent flex items-center gap-1.5">
                우리만의 비밀 서재 <span className="text-xs font-bold text-blue-600/80 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">Secret Library</span>
              </h1>
              <p className="text-[11px] text-blue-600/70 font-medium">은밀히 수집된 감성 웹툰 키워드 큐레이션 Archive</p>
            </div>
          </div>

          {/* 우측 로그인 & 관리자 상태 */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {userProfile ? (
              <div className="flex items-center space-x-2 bg-blue-50/80 border border-blue-200/60 rounded-full px-3 py-1.5 text-xs text-blue-900">
                <span className="font-bold">{userProfile.nickname}님</span>
                {userProfile.isAdmin ? (
                  <span className="bg-blue-600 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                    <ShieldCheck className="w-3 h-3" /> 관리자
                  </span>
                ) : (
                  <button 
                    onClick={toggleAdminPermission}
                    className="text-[10px] text-blue-600 hover:underline font-semibold"
                    title="테스트용: 클릭 시 관리자 권한 활성화"
                  >
                    (관리자 체험)
                  </button>
                )}
                <button
                  onClick={handleSignOut}
                  className="ml-1 p-1 hover:text-red-500 transition-colors"
                  title="로그아웃"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAuthMode('login');
                  setShowAuthModal(true);
                }}
                className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-full text-xs font-bold shadow-md shadow-blue-600/20 transition-all"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>로그인 / 회원가입</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. 메인 컨테이너 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* 관리자 혜택 바 */}
        {userProfile?.isAdmin && (
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-800 rounded-2xl text-white shadow-xl shadow-blue-950/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl text-sky-300">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  실시간 업데이트 관리자 모드 활성화 중
                </h3>
                <p className="text-xs text-blue-200/80">
                  여기서 추가/수정한 웹툰은 링크를 받은 친구들 화면에도 <strong>실시간(Live)으로 즉시 반영</strong>됩니다.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setEditingWebtoon(null);
                setEditModalOpen(true);
              }}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-sky-400 hover:bg-sky-300 text-blue-950 font-black px-4 py-2.5 rounded-xl text-xs shadow-md transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>새 웹툰 추천 등록하기</span>
            </button>
          </div>
        )}

        {/* 3. 서류 파일 인덱스 스타일 탭 (Physical Folder Index Tab Navigation) */}
        <div className="relative mb-8">
          
          {/* 돌출된 인덱스 탭 라벨 헤더 */}
          <div className="flex items-end space-x-1 sm:space-x-2 px-2 overflow-x-auto no-scrollbar pt-2 border-b-2 border-blue-200">
            
            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center space-x-2 px-4 py-3 rounded-t-2xl font-extrabold text-xs transition-all duration-200 shadow-sm border-t-2 border-x-2 ${
                activeTab === 'all'
                  ? 'bg-white text-blue-900 border-blue-200 -mb-0.5 z-10 pb-3.5 pt-3.5 shadow-md'
                  : 'bg-blue-100/70 hover:bg-blue-100 text-blue-700/80 border-blue-200/60'
              }`}
            >
              <Layers className="w-4 h-4 text-blue-600" />
              <span>📚 전체 모아보기</span>
            </button>

            <button
              onClick={() => setActiveTab('keywords')}
              className={`flex items-center space-x-2 px-4 py-3 rounded-t-2xl font-extrabold text-xs transition-all duration-200 shadow-sm border-t-2 border-x-2 ${
                activeTab === 'keywords'
                  ? 'bg-white text-blue-900 border-blue-200 -mb-0.5 z-10 pb-3.5 pt-3.5 shadow-md'
                  : 'bg-blue-100/70 hover:bg-blue-100 text-blue-700/80 border-blue-200/60'
              }`}
            >
              <Tag className="w-4 h-4 text-blue-600" />
              <span>🏷️ 키워드별 보기</span>
            </button>

            <button
              onClick={() => setActiveTab('authors')}
              className={`flex items-center space-x-2 px-4 py-3 rounded-t-2xl font-extrabold text-xs transition-all duration-200 shadow-sm border-t-2 border-x-2 ${
                activeTab === 'authors'
                  ? 'bg-white text-blue-900 border-blue-200 -mb-0.5 z-10 pb-3.5 pt-3.5 shadow-md'
                  : 'bg-blue-100/70 hover:bg-blue-100 text-blue-700/80 border-blue-200/60'
              }`}
            >
              <User className="w-4 h-4 text-blue-600" />
              <span>✍️ 작가별 보기</span>
            </button>

            <button
              onClick={() => setActiveTab('platforms')}
              className={`flex items-center space-x-2 px-4 py-3 rounded-t-2xl font-extrabold text-xs transition-all duration-200 shadow-sm border-t-2 border-x-2 ${
                activeTab === 'platforms'
                  ? 'bg-white text-blue-900 border-blue-200 -mb-0.5 z-10 pb-3.5 pt-3.5 shadow-md'
                  : 'bg-blue-100/70 hover:bg-blue-100 text-blue-700/80 border-blue-200/60'
              }`}
            >
              <Tv className="w-4 h-4 text-blue-600" />
              <span>📺 플랫폼별 보기</span>
            </button>

          </div>

          {/* 탭 내부 세부 필터 바 (Folder Paper Body) */}
          <div className="bg-white border-x-2 border-b-2 border-blue-200 rounded-b-3xl p-5 shadow-sm space-y-4">
            
            {/* 상단 검색 & 정렬 바 */}
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="relative w-full sm:flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
                <input
                  type="text"
                  placeholder="제목, 작가명, 키워드, 추천사 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-blue-50/40 border border-blue-100 rounded-2xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                />
                {searchTerm && (
                  <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2 self-end sm:self-auto bg-blue-50/60 border border-blue-100 rounded-2xl px-3 py-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[11px] text-blue-800 font-bold">정렬:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="latest">최신 등록순</option>
                  <option value="rating">별점 높은순</option>
                  <option value="popular">하트 추천순</option>
                </select>
              </div>
            </div>

            {/* 탭별 인덱스 전용 내용물 */}
            {activeTab === 'keywords' && (
              <div className="pt-3 border-t border-blue-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-blue-900">태그 복수 선택 필터:</span>
                  {selectedKeywords.length > 0 && (
                    <button
                      onClick={() => setSelectedKeywords([])}
                      className="text-xs text-blue-600 hover:underline flex items-center space-x-1 font-semibold"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>선택 초기화</span>
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allKeywords.map((kw) => {
                    const isSelected = selectedKeywords.includes(kw);
                    return (
                      <button
                        key={kw}
                        onClick={() => {
                          if (isSelected) setSelectedKeywords(selectedKeywords.filter(k => k !== kw));
                          else setSelectedKeywords([...selectedKeywords, kw]);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-bold'
                            : 'bg-blue-50/80 text-blue-800 hover:bg-blue-100 border border-blue-100'
                        }`}
                      >
                        #{kw}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'authors' && (
              <div className="pt-3 border-t border-blue-50">
                <span className="text-xs font-bold text-blue-900 block mb-2">작가별 모아보기:</span>
                <div className="flex flex-wrap gap-2">
                  {authorList.map((author) => (
                    <button
                      key={author}
                      onClick={() => setSelectedAuthor(author)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        selectedAuthor === author
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                          : 'bg-blue-50/80 text-blue-900 hover:bg-blue-100 border border-blue-100'
                      }`}
                    >
                      {author === 'ALL' ? '전체 작가' : `✍️ ${author}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'platforms' && (
              <div className="pt-3 border-t border-blue-50">
                <span className="text-xs font-bold text-blue-900 block mb-2">플랫폼별 모아보기:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedPlatform('ALL')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      selectedPlatform === 'ALL'
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                        : 'bg-blue-50/80 text-blue-900 hover:bg-blue-100 border border-blue-100'
                    }`}
                  >
                    전체 플랫폼
                  </button>
                  {PLATFORM_LIST.map((platform) => (
                    <button
                      key={platform}
                      onClick={() => setSelectedPlatform(platform)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        selectedPlatform === platform
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                          : 'bg-blue-50/80 text-blue-900 hover:bg-blue-100 border border-blue-100'
                      }`}
                    >
                      📺 {platform}
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* 4. 웹툰 추천작 카드 그리드 */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider">
              {activeTab === 'keywords' && '태그 필터 결과'}
              {activeTab === 'authors' && '작가별 필터 결과'}
              {activeTab === 'platforms' && '플랫폼 필터 결과'}
              {activeTab === 'all' && '추천 웹툰목록'} 
              <span className="text-blue-600 font-black ml-1.5">({filteredWebtoons.length})</span>
            </h3>
          </div>

          {loading ? (
            <div className="text-center py-20 bg-white/60 rounded-3xl border border-blue-100">
              <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-2" />
              <p className="text-xs text-blue-800 font-semibold">실시간 데이터 로딩 중...</p>
            </div>
          ) : filteredWebtoons.length === 0 ? (
            /* 빈 클린 상태 (0개 상태) 안내 UI */
            <div className="text-center py-16 px-4 bg-white rounded-3xl border-2 border-dashed border-blue-200">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-blue-500">
                <BookOpen className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">
                {webtoons.length === 0 ? '아직 등록된 웹툰이 없습니다' : '조건에 맞는 웹툰이 없습니다'}
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                {webtoons.length === 0 
                  ? '관리자가 실시간으로 멋진 인생 BL 웹툰들을 등록하면 바로 여기에 업데이트됩니다!'
                  : '다른 키워드나 태그로 검색해 보세요.'}
              </p>
              {userProfile?.isAdmin && (
                <button
                  onClick={() => {
                    setEditingWebtoon(null);
                    setEditModalOpen(true);
                  }}
                  className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>첫 번째 웹툰 등록하기</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredWebtoons.map((webtoon) => (
                <div
                  key={webtoon.id}
                  onClick={() => setSelectedWebtoon(webtoon)}
                  className="group bg-white border border-blue-100 rounded-3xl overflow-hidden hover:border-blue-300 hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 flex flex-col cursor-pointer relative"
                >
                  {/* 표지 이미지 */}
                  <div className="relative aspect-[3/4] bg-blue-50 overflow-hidden">
                    <img
                      src={webtoon.thumbnail}
                      alt={webtoon.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => {
                        e.target.src = 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=600';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />

                    {/* 강력추천 뱃지 */}
                    {webtoon.isTopPick && (
                      <div className="absolute top-3 left-3 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black text-[10px] px-2.5 py-1 rounded-full shadow-md flex items-center gap-1">
                        <Flame className="w-3 h-3 fill-current text-slate-900" />
                        <span>강력추천</span>
                      </div>
                    )}

                    {/* 하트 추천 버튼 */}
                    <button
                      onClick={(e) => handleLike(e, webtoon.id, webtoon.likes)}
                      className="absolute top-3 right-3 p-2 bg-white/80 hover:bg-white text-pink-500 rounded-full backdrop-blur-md shadow-md transition-transform active:scale-90 flex items-center space-x-1 px-2.5"
                    >
                      <Heart className="w-3.5 h-3.5 fill-current" />
                      <span className="text-[10px] font-bold text-slate-800">{webtoon.likes || 0}</span>
                    </button>

                    {/* 하단 플랫폼 및 별점 */}
                    <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
                      <span className="text-[11px] font-bold bg-blue-950/80 text-sky-200 backdrop-blur-md border border-blue-400/30 px-2.5 py-0.5 rounded-lg">
                        {webtoon.platform}
                      </span>
                      
                      <div className="flex items-center bg-white/90 backdrop-blur-md px-2 py-0.5 rounded-lg text-amber-500 text-xs font-bold shadow-sm">
                        <Star className="w-3.5 h-3.5 fill-current mr-0.5" />
                        <span>{webtoon.rating || 5}.0</span>
                      </div>
                    </div>
                  </div>

                  {/* 카드 정보 */}
                  <div className="p-4 flex-1 flex flex-col justify-between bg-white">
                    <div>
                      <h4 className="font-bold text-slate-900 text-base group-hover:text-blue-600 transition-colors line-clamp-1 mb-0.5">
                        {webtoon.title}
                      </h4>
                      <p className="text-xs text-slate-500 mb-3 font-medium">작가: {webtoon.author}</p>

                      {/* 친구 추천평 */}
                      {webtoon.friendReview && (
                        <div className="bg-blue-50/60 border border-blue-100/80 rounded-2xl p-3 mb-3">
                          <p className="text-[11px] text-blue-900/90 line-clamp-2 leading-relaxed italic">
                            💬 "{webtoon.friendReview}"
                          </p>
                        </div>
                      )}

                      {/* 태그 목록 */}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {webtoon.keywords?.map((kw, idx) => (
                          <span key={idx} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">
                            #{kw}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* 관리자 수정/삭제 아이콘 */}
                    {userProfile?.isAdmin && (
                      <div className="pt-3 mt-2 border-t border-slate-100 flex items-center justify-end space-x-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setEditingWebtoon(webtoon);
                            setEditModalOpen(true);
                          }}
                          className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg text-xs font-bold flex items-center space-x-1"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>수정</span>
                        </button>
                        <button
                          onClick={() => handleDeleteWebtoon(webtoon.id, webtoon.title)}
                          className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg text-xs font-bold flex items-center space-x-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>삭제</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* 5. 상세 보기 모달 */}
      {selectedWebtoon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white border border-blue-100 rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setSelectedWebtoon(null)}
              className="absolute top-4 right-4 z-10 bg-slate-900/60 text-white hover:bg-slate-900 p-2 rounded-full backdrop-blur-md transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col sm:flex-row overflow-y-auto">
              <div className="sm:w-1/2 aspect-[3/4] sm:aspect-auto relative bg-blue-50 shrink-0">
                <img
                  src={selectedWebtoon.thumbnail}
                  alt={selectedWebtoon.title}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="sm:w-1/2 p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-xs bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 rounded-full">
                      {selectedWebtoon.platform}
                    </span>
                    <div className="flex items-center text-amber-500 text-xs font-bold">
                      <Star className="w-3.5 h-3.5 fill-current mr-1" />
                      <span>{selectedWebtoon.rating}.0 / 5.0</span>
                    </div>
                  </div>

                  <h3 className="text-xl font-black text-slate-900 mb-1">{selectedWebtoon.title}</h3>
                  <p className="text-xs text-slate-500 font-semibold mb-4">작가: {selectedWebtoon.author}</p>

                  <div className="mb-4">
                    <h4 className="text-xs font-extrabold text-blue-900 mb-1.5 flex items-center space-x-1">
                      <MessageCircleHeart className="w-4 h-4 text-blue-600" />
                      <span>Curator's Note</span>
                    </h4>
                    <p className="text-xs text-slate-700 leading-relaxed bg-blue-50/70 border border-blue-100 p-3.5 rounded-2xl italic">
                      "{selectedWebtoon.friendReview || '작품만의 깊은 매력과 서사를 꼭 확인해 보세요.'}"
                    </p>
                  </div>

                  <div className="mb-6">
                    <h4 className="text-xs font-bold text-slate-400 mb-2">핵심 태그</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedWebtoon.keywords?.map((kw, idx) => (
                        <span key={idx} className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-medium">
                          #{kw}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  {selectedWebtoon.url ? (
                    <a
                      href={selectedWebtoon.url}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 text-white font-bold py-3.5 rounded-2xl text-xs transition-all shadow-lg shadow-blue-600/20"
                    >
                      <span>공식 {selectedWebtoon.platform} 보러가기</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  ) : (
                    <div className="text-center text-xs text-slate-400 py-2">등록된 감상 링크가 없습니다.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. 회원가입 & 로그인 인증 모달 */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-white border border-blue-100 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <button onClick={() => setShowAuthModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <User className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900">
                {authMode === 'login' ? '사이트 로그인' : '새 계정 회원가입'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                로그인하면 내 이름으로 추천작을 관리하거나 마음껏 둘러볼 수 있습니다.
              </p>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">닉네임</label>
                  <input
                    type="text"
                    required
                    placeholder="예: 웹툰덕후"
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    className="w-full px-4 py-2.5 bg-blue-50/30 border border-blue-100 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">아이디 (ID)</label>
                <input
                  type="text"
                  required
                  placeholder="아이디 입력"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-blue-50/30 border border-blue-100 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">비밀번호 (Password)</label>
                <input
                  type="password"
                  required
                  placeholder="******"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-blue-50/30 border border-blue-100 rounded-xl text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              {authError && (
                <p className="text-xs text-red-500 bg-red-50 p-2.5 rounded-xl border border-red-100">{authError}</p>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-all"
              >
                {authMode === 'login' ? '로그인하기' : '가입 완료하기'}
              </button>
            </form>

            <div className="mt-4 pt-4 border-t border-slate-100 text-center">
              <button
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'signup' : 'login');
                  setAuthError('');
                }}
                className="text-xs text-blue-600 hover:underline font-semibold"
              >
                {authMode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. 관리자 전용 웹툰 등록/수정 모달 */}
      {editModalOpen && (
        <AdminWebtoonModal
          initialData={editingWebtoon}
          allKeywords={allKeywords}
          onClose={() => setEditModalOpen(false)}
          onSave={handleSaveWebtoon}
        />
      )}

      {/* 8. 토스트 메시지 */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-2 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-sky-400" />
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
}

// 관리자 등록/수정 폼 모달
function AdminWebtoonModal({ initialData, allKeywords, onClose, onSave }) {
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    author: initialData?.author || '',
    thumbnail: initialData?.thumbnail || '',
    platform: initialData?.platform || '봄툰',
    url: initialData?.url || '',
    keywords: initialData?.keywords || [],
    rating: initialData?.rating || 5,
    friendReview: initialData?.friendReview || '',
    isTopPick: initialData?.isTopPick || false
  });

  const [customTag, setCustomTag] = useState('');

  // 이미지 파일 업로드
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, thumbnail: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleKeyword = (kw) => {
    if (formData.keywords.includes(kw)) {
      setFormData({ ...formData, keywords: formData.keywords.filter(k => k !== kw) });
    } else {
      setFormData({ ...formData, keywords: [...formData.keywords, kw] });
    }
  };

  const addCustomTag = () => {
    const trimmed = customTag.trim();
    if (trimmed && !formData.keywords.includes(trimmed)) {
      setFormData({ ...formData, keywords: [...formData.keywords, trimmed] });
      setCustomTag('');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title || !formData.author) {
      alert('제목과 작가명은 필수입니다.');
      return;
    }
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border border-blue-100 rounded-3xl p-6 sm:p-8 max-w-xl w-full my-8 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-base font-black text-slate-900 mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <span>{initialData ? '추천 웹툰 정보 수정' : '새 추천 웹툰 등록 (실시간)'}</span>
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">제목 *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 bg-blue-50/30 border border-blue-100 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">작가명 *</label>
              <input
                type="text"
                required
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                className="w-full px-3 py-2 bg-blue-50/30 border border-blue-100 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* 표지 이미지 업로드 */}
          <div className="bg-blue-50/50 p-3 border border-blue-100 rounded-2xl">
            <label className="block text-xs font-extrabold text-blue-900 mb-1">실제 웹툰 표지 등록</label>
            <div className="space-y-2">
              <label className="flex items-center justify-center space-x-2 bg-white hover:bg-blue-50 text-blue-800 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors border border-blue-200 shadow-sm">
                <Upload className="w-4 h-4 text-blue-600" />
                <span>기기에서 표지 사진 업로드</span>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>

              <input
                type="text"
                value={formData.thumbnail}
                placeholder="또는 이미지 URL 직접 입력 (https://...)"
                onChange={(e) => setFormData({ ...formData, thumbnail: e.target.value })}
                className="w-full px-3 py-2 bg-white border border-blue-100 rounded-xl text-xs text-slate-800 focus:outline-none"
              />
            </div>

            {formData.thumbnail && (
              <div className="mt-2 flex items-center space-x-3 bg-white p-2 rounded-xl border border-blue-100">
                <img src={formData.thumbnail} alt="Preview" className="w-10 h-14 object-cover rounded-lg" />
                <span className="text-xs text-blue-800 font-bold">표지 미리보기 완료</span>
              </div>
            )}
          </div>

          {/* 플랫폼 & 별점 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">제공 플랫폼</label>
              <select
                value={formData.platform}
                onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
                className="w-full px-3 py-2 bg-blue-50/30 border border-blue-100 rounded-xl text-xs text-slate-800 focus:outline-none"
              >
                {PLATFORM_LIST.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">내 추천 별점</label>
              <select
                value={formData.rating}
                onChange={(e) => setFormData({ ...formData, rating: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-blue-50/30 border border-blue-100 rounded-xl text-xs text-slate-800 focus:outline-none"
              >
                <option value={5}>★★★★★ (5점)</option>
                <option value={4}>★★★★☆ (4점)</option>
                <option value={3}>★★★☆☆ (3점)</option>
              </select>
            </div>

            <div className="flex items-center pt-3">
              <label className="flex items-center space-x-2 cursor-pointer text-xs font-bold text-amber-600">
                <input
                  type="checkbox"
                  checked={formData.isTopPick}
                  onChange={(e) => setFormData({ ...formData, isTopPick: e.target.checked })}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-0"
                />
                <span>🔥 '강력 추천' 뱃지</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">공식 감상 링크 URL</label>
            <input
              type="text"
              value={formData.url}
              placeholder="https://www.bomtoon.com/..."
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              className="w-full px-3 py-2 bg-blue-50/30 border border-blue-100 rounded-xl text-xs text-slate-800 focus:outline-none"
            />
          </div>

          {/* 영업 코멘트 */}
          <div>
            <label className="block text-xs font-bold text-blue-900 mb-1">큐레이터 관전 포인트 (추천 코멘트)</label>
            <textarea
              rows={3}
              value={formData.friendReview}
              placeholder="작품의 매력 포인트, 서사, 인물 관계성 등의 코멘트를 남겨보세요."
              onChange={(e) => setFormData({ ...formData, friendReview: e.target.value })}
              className="w-full px-3 py-2 bg-blue-50/30 border border-blue-100 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* 태그 선택 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">키워드 선택</label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-blue-50/30 rounded-xl border border-blue-100 mb-2">
              {allKeywords.map((kw) => {
                const active = formData.keywords.includes(kw);
                return (
                  <button
                    type="button"
                    key={kw}
                    onClick={() => toggleKeyword(kw)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                      active ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 border border-blue-100'
                    }`}
                  >
                    #{kw}
                  </button>
                );
              })}
            </div>

            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="새 태그 입력..."
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                className="flex-1 px-3 py-1 bg-blue-50/30 border border-blue-100 rounded-xl text-xs text-slate-800 focus:outline-none"
              />
              <button
                type="button"
                onClick={addCustomTag}
                className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-900 text-xs font-bold rounded-xl"
              >
                태그 추가
              </button>
            </div>
          </div>

          {/* 저장 및 취소 */}
          <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md"
            >
              실시간 등록하기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
