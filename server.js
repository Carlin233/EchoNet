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

// Cria tabelas se não existirem
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
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

// Pasta de uploads
const uploadDir = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configura multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "_" + file.originalname.replace(/\s+/g, "_");
    cb(null, unique);
  }
});
const upload = multer({ storage });

// Middlewares
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: "echonet-secret",
    resave: false,
    saveUninitialized: false
  })
);

// Rota principal (feed)
app.get("/", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");

  db.all("SELECT * FROM posts ORDER BY criado_em DESC", (err, posts) => {
    if (err) {
      console.error("Erro ao buscar posts:", err);
      return res.send("Erro ao carregar o feed.");
    }

    res.render("index", {
      username: req.session.user.username,
      posts: posts
    });
  });
});

// Rota de perfil
app.get("/perfil", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");

  const username = req.session.user.username;

  db.all("SELECT * FROM posts WHERE usuario = ? ORDER BY criado_em DESC", [username], (err, posts) => {
    if (err) {
      console.error("Erro ao buscar posts do perfil:", err);
      return res.send("Erro ao carregar o perfil.");
    }

    res.render("perfil", {
      username,
      posts
    });
  });
});

// Rota para deletar post
app.post("/deletar-post/:id", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");

  const postId = req.params.id;
  const usuario = req.session.user.username;

  db.get("SELECT * FROM posts WHERE id = ? AND usuario = ?", [postId, usuario], (err, post) => {
    if (err || !post) {
      return res.send("Post não encontrado ou não autorizado.");
    }

    const filePath = path.join(__dirname, "public", post.imagem);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    db.run("DELETE FROM posts WHERE id = ?", [postId], (err) => {
      if (err) {
        console.error("Erro ao deletar post:", err);
        return res.send("Erro ao deletar o post.");
      }
      res.redirect("/perfil");
    });
  });
});

// Rota para postar
app.post("/postar", upload.single("imagem"), (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");

  const imagem = req.file ? "/uploads/" + encodeURIComponent(req.file.filename) : null;
  const legenda = req.body.legenda;
  const usuario = req.session.user.username;

  if (!imagem || !legenda) {
    return res.send("Erro: campos obrigatórios.");
  }

  db.run(
    "INSERT INTO posts (imagem, legenda, usuario) VALUES (?, ?, ?)",
    [imagem, legenda, usuario],
    (err) => {
      if (err) {
        console.error("Erro ao inserir post:", err);
        return res.send("Erro ao postar.");
      }
      res.redirect("/");
    }
  );
});

// Cadastro
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, row) => {
    if (row) {
      return res.send("E-mail já cadastrado. <a href='/register.html'>Tente outro</a>");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username, email, hashedPassword],
      (err) => {
        if (err) return res.send("Erro ao cadastrar.");
        res.send("Cadastro realizado com sucesso! <a href='/login.html'>Fazer login</a>");
      }
    );
  });
});

// Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
    if (!user) {
      return res.send("Usuário não encontrado. <a href='/login.html'>Tentar novamente</a>");
    }

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

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login.html");
  });
});

// Páginas públicas
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "views/login.html"));
});
app.get("/register.html", (req, res) => {
  res.sendFile(path.join(__dirname, "views/register.html"));
});

// Inicia servidor
app.listen(PORT, () => {
  console.log(`EchoNet rodando em http://localhost:${PORT}`);
});

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remetente TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    conteudo TEXT NOT NULL,
    enviado_em DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

app.get("/mensagens/:destinatario", (req, res) => {
  if (!req.session.user) return res.redirect("/login.html");

  const usuarioLogado = req.session.user.username;
  const destinatario = req.params.destinatario;

  db.all(`
    SELECT * FROM messages 
    WHERE (remetente = ? AND destinatario = ?) OR 
          (remetente = ? AND destinatario = ?)
    ORDER BY enviado_em ASC
  `, [usuarioLogado, destinatario, destinatario, usuarioLogado], (err, mensagens) => {
    if (err) {
      console.error("Erro ao buscar mensagens:", err);
      return res.send("Erro ao carregar as mensagens.");
    }

    res.render("mensagens", { mensagens, usuarioLogado, destinatario });
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
      if (err) {
        console.error("Erro ao enviar mensagem:", err);
        return res.send("Erro ao enviar.");
      }
      res.redirect("/mensagens/" + destinatario);
    }
  );
});

app.post("/atualizar-ativo", (req, res) => {
  const usuario = req.session.usuario;
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

  db.all(query, [req.session.usuario], (err, rows) => {
    if (err) return res.sendStatus(500);
    res.json(rows);
  });
});