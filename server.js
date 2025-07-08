// server.js corrigido

const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");

const app = express();
const PORT = 3000;

// Configura EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Banco de dados
const db = new sqlite3.Database("./database.sqlite", (err) => {
  if (err) console.error("Erro ao conectar ao banco:", err);
  else console.log("Banco SQLite conectado.");
});

// Criação de tabelas
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    ultimo_ativo DATETIME
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imagem TEXT NOT NULL,
    legenda TEXT NOT NULL,
    usuario TEXT NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remetente TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    enviado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Uploads
const uploadDir = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "_" + file.originalname.replace(/\s+/g, "_");
    cb(null, unique);
  }
});
const upload = multer({ storage });

// Middlewares
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret: "echonet-secret",
  resave: false,
  saveUninitialized: false
}));

// Rotas principais
app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");
  db.all("SELECT * FROM posts ORDER BY criado_em DESC", (err, posts) => {
    if (err) return res.send("Erro ao carregar o feed.");
    res.render("index", {
      username: req.session.user.username,
      posts
    });
  });
});

app.get("/perfil", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");
  const username = req.session.user.username;
  db.all("SELECT * FROM posts WHERE usuario = ? ORDER BY criado_em DESC", [username], (err, posts) => {
    if (err) return res.send("Erro ao carregar o perfil.");
    res.render("perfil", { username, posts });
  });
});

app.post("/deletar-post/:id", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");
  const postId = req.params.id;
  const usuario = req.session.user.username;

  db.get("SELECT * FROM posts WHERE id = ? AND usuario = ?", [postId, usuario], (err, post) => {
    if (err || !post) return res.send("Post não encontrado ou não autorizado.");

    const filePath = path.join(__dirname, "public", post.imagem);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    db.run("DELETE FROM posts WHERE id = ?", [postId], (err) => {
      if (err) return res.send("Erro ao deletar o post.");
      res.redirect("/perfil");
    });
  });
});

app.post("/postar", upload.single("imagem"), (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");

  const imagem = req.file ? "/uploads/" + encodeURIComponent(req.file.filename) : null;
  const legenda = req.body.legenda;
  const usuario = req.session.user.username;

  if (!imagem || !legenda) return res.send("Erro: campos obrigatórios.");

  db.run("INSERT INTO posts (imagem, legenda, usuario) VALUES (?, ?, ?)", [imagem, legenda, usuario], (err) => {
    if (err) return res.send("Erro ao postar.");
    res.redirect("/");
  });
});

// Autenticação
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, row) => {
    if (row) return res.send("E-mail já cadastrado. <a href='/register.html'>Tente outro</a>");

    const hashedPassword = await bcrypt.hash(password, 10);
    db.run("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", [username, email, hashedPassword], (err) => {
      if (err) return res.send("Erro ao cadastrar.");
      res.send("Cadastro realizado com sucesso! <a href='/login.html'>Fazer login</a>");
    });
  });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (!user) return res.send("Usuário não encontrado. <a href='/login.html'>Tentar novamente</a>");

    const match = await bcrypt.compare(password, user.password);
    if (match) {
      req.session.user = {
        id: user.id,
        username: user.username,
        email: user.email
      };
      res.redirect("/");
    } else {
      res.send("Senha incorreta. <a href='/login.html'>Tente novamente</a>");
    }
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login.html"));
});

// Rota para exibir lista de contatos, sem destinatário selecionado
app.get("/mensagens", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");
  const usuarioLogado = req.session.user.username;

  const queryContatos = `
    SELECT DISTINCT
      CASE
        WHEN remetente = ? THEN destinatario
        ELSE remetente
      END AS contato
    FROM messages
    WHERE remetente = ? OR destinatario = ?
    ORDER BY contato;
  `;

  db.all(queryContatos, [usuarioLogado, usuarioLogado, usuarioLogado], (err, contatos) => {
    if (err) return res.send("Erro ao carregar contatos.");
    res.render("mensagens", {
      mensagens: [],
      usuarioLogado,
      destinatario: null,
      contatos
    });
  });
});

app.get("/mensagens/:destinatario", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");
  const usuarioLogado = req.session.user.username;
  const destinatario = decodeURIComponent(req.params.destinatario);

  if (destinatario.trim().toLowerCase() === usuarioLogado.trim().toLowerCase()) {
    return res.redirect("/mensagens");
  }

  const queryContatos = `
    SELECT DISTINCT
      CASE
        WHEN remetente = ? THEN destinatario
        ELSE remetente
      END AS contato
    FROM messages
    WHERE remetente = ? OR destinatario = ?
    ORDER BY contato;
  `;

  const queryMensagens = `
    SELECT * FROM messages
    WHERE (remetente = ? AND destinatario = ?) OR
          (remetente = ? AND destinatario = ?)
    ORDER BY enviado_em ASC;
  `;

  db.all(queryContatos, [usuarioLogado, usuarioLogado, usuarioLogado], (err, contatos) => {
    if (err) return res.send("Erro ao carregar contatos.");
    db.all(queryMensagens, [usuarioLogado, destinatario, destinatario, usuarioLogado], (err2, mensagens) => {
      if (err2) return res.send("Erro ao carregar mensagens.");
      res.render("mensagens", {
        mensagens,
        usuarioLogado,
        destinatario,
        contatos // 👈 ESSA LINHA TEM QUE EXISTIR
      });
    });
  });
});


app.post("/mensagens", (req, res) => {
  if (!req.session.user) return res.status(401).send("Não autenticado.");
  const { destinatario, conteudo } = req.body;
  const remetente = req.session.user.username;

  db.run(
    "INSERT INTO messages (remetente, destinatario, conteudo) VALUES (?, ?, ?)",
    [remetente, destinatario, conteudo],
    (err) => {
      if (err) return res.send("Erro ao enviar mensagem.");
      res.redirect("/mensagens/" + destinatario);
    }
  );
});

// Atualiza status online
app.post("/atualizar-ativo", (req, res) => {
  const usuario = req.session.user?.username;
  if (!usuario) return res.sendStatus(401);

  const query = `UPDATE users SET ultimo_ativo = datetime('now') WHERE username = ?`;
  db.run(query, [usuario], (err) => {
    if (err) return res.sendStatus(500);
    res.sendStatus(200);
  });
});

app.get("/online-users", (req, res) => {
  const query = `
    SELECT username,
      CASE
        WHEN ultimo_ativo >= datetime('now', '-1 minute') THEN 'online'
        WHEN ultimo_ativo >= datetime('now', '-5 minutes') THEN 'away'
        ELSE 'offline'
      END as status
    FROM users
    WHERE username != ?
    ORDER BY username;
  `;
  db.all(query, [req.session.user?.username], (err, rows) => {
    if (err) return res.sendStatus(500);
    res.json(rows);
  });
});

app.get("/conversas", (req, res) => {
  if (!req.session.user) return res.status(401).send("Não autenticado.");
  const username = req.session.user.username;
  const query = `
    SELECT DISTINCT
      CASE
        WHEN remetente = ? THEN destinatario
        ELSE remetente
      END AS contato
    FROM messages
    WHERE remetente = ? OR destinatario = ?
    ORDER BY contato;
  `;
  db.all(query, [username, username, username], (err, rows) => {
    if (err) return res.status(500).send("Erro interno.");
    res.json(rows);
  });
});

// Páginas públicas
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "views/login.html"));
});

app.get("/register.html", (req, res) => {
  res.sendFile(path.join(__dirname, "views/register.html"));
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`EchoNet rodando em http://localhost:${PORT}`);
});
