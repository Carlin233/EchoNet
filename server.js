const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const app = express();
const db = new sqlite3.Database("./database.sqlite");

app.use(cors({
  origin: "https://echonet-4t31.onrender.com", // use o domínio real do frontend
  credentials: true
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: "segredo",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,         // importante para HTTPS
    sameSite: "none"      // necessário para cross-site session
  }
}));

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Configurar armazenamento do multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = Date.now() + "_" + file.originalname;
    cb(null, name);
  }
});
const upload = multer({ storage });

// Tabela de usuários e postagens
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT,
    password TEXT,
    ultimo_ativo DATETIME
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT,
    imagem TEXT,
    legenda TEXT
  )
`);

// Páginas
app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  db.all("SELECT * FROM posts ORDER BY id DESC", [], (err, posts) => {
    if (err) return res.sendStatus(500);
    res.render("index", {
      username: req.session.user.username,
      posts
    });
  });
});

app.get("/perfil", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  db.all("SELECT * FROM posts WHERE usuario = ? ORDER BY id DESC", [req.session.user.username], (err, posts) => {
    if (err) return res.sendStatus(500);
    res.render("perfil", {
      username: req.session.user.username,
      posts
    });
  });
});

// Login e registro
app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err || !user) return res.redirect("/login");
    bcrypt.compare(password, user.password, (err, result) => {
      if (result) {
        req.session.user = {
          id: user.id,
          username: user.username,
          email: user.email
        };
        res.redirect("/");
      } else {
        res.redirect("/login");
      }
    });
  });
});

app.post("/register", (req, res) => {
  const { username, email, password } = req.body;
  bcrypt.hash(password, 10, (err, hash) => {
    db.run("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", [username, email, hash], (err) => {
      if (err) return res.redirect("/login");
      res.redirect("/login");
    });
  });
});

app.get("/logout", (req, res) => {
  const usuario = req.session.user?.username;
  db.run("UPDATE users SET ultimo_ativo = NULL WHERE username = ?", [usuario], () => {
    req.session.destroy(() => {
      res.redirect("/login");
    });
  });
});

// Postagens
app.post("/postar", upload.single("imagem"), (req, res) => {
  const usuario = req.session.user?.username;
  if (!usuario) return res.sendStatus(401);
  const legenda = req.body.legenda;
  const imagem = "/uploads/" + req.file.filename;

  db.run("INSERT INTO posts (usuario, imagem, legenda) VALUES (?, ?, ?)", [usuario, imagem, legenda], err => {
    if (err) return res.sendStatus(500);
    res.sendStatus(200);
  });
});

app.post("/deletar-post/:id", (req, res) => {
  const postId = req.params.id;
  db.get("SELECT * FROM posts WHERE id = ?", [postId], (err, post) => {
    if (!post) return res.redirect("/perfil");
    const caminho = path.join(__dirname, post.imagem);
    fs.unlink(caminho, () => {
      db.run("DELETE FROM posts WHERE id = ?", [postId], () => {
        res.redirect("/perfil");
      });
    });
  });
});

// ✅ ROTA CORRIGIDA: atualiza ultimo_ativo
app.post("/atualizar-ativo", (req, res) => {
  const usuario = req.session.user?.username;
  if (!usuario) return res.sendStatus(401);

  const query = `UPDATE users SET ultimo_ativo = datetime('now') WHERE username = ?`;
  db.run(query, [usuario], (err) => {
    if (err) return res.sendStatus(500);
    res.sendStatus(200);
  });
});

// Rota para obter lista de usuários com status
app.get("/online-users", (req, res) => {
  const usuarioAtual = req.session.user?.username;
  if (!usuarioAtual) return res.sendStatus(401);

  const query = `
    SELECT username,
      CASE
        WHEN ultimo_ativo >= datetime('now', '-1 minute') THEN 'online'
        WHEN ultimo_ativo >= datetime('now', '-5 minutes') THEN 'away'
        ELSE 'offline'
      END as status
    FROM users
    WHERE username != ?
    ORDER BY username
  `;

  db.all(query, [usuarioAtual], (err, rows) => {
    if (err) return res.sendStatus(500);
    res.json(rows);
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Servidor rodando na porta", PORT));