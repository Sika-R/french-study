import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import AddPage from './pages/AddPage';
import WordList from './pages/WordList';
import Review from './pages/Review';
import Stats from './pages/Stats';
import Settings from './pages/Settings';

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <nav className="sidebar">
          <h1>French Deck</h1>
          <NavLink to="/" end>录入</NavLink>
          <NavLink to="/review">复习</NavLink>
          <NavLink to="/list">单词列表</NavLink>
          <NavLink to="/stats">统计</NavLink>
          <NavLink to="/settings">设置</NavLink>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<AddPage />} />
            <Route path="/review" element={<Review />} />
            <Route path="/list" element={<WordList />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
