import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import AddWord from './pages/AddWord';
import WordList from './pages/WordList';
import Review from './pages/Review';
import Stats from './pages/Stats';

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <nav className="sidebar">
          <h1>French Deck</h1>
          <NavLink to="/" end>录入新词</NavLink>
          <NavLink to="/review">复习</NavLink>
          <NavLink to="/list">单词列表</NavLink>
          <NavLink to="/stats">统计</NavLink>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<AddWord />} />
            <Route path="/review" element={<Review />} />
            <Route path="/list" element={<WordList />} />
            <Route path="/stats" element={<Stats />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
