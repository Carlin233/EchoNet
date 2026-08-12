const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const session = require("express-session");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");
const os = require("os");

const app = express();
const PORT = 3000;

// ===============================
// CONFIGURAÇÃO DO EJS
// ===============================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ===============================
// BANCO DE DADOS
// ===============================
const db = new sqlite3.Database("./database.sqlite", (err) => {
    if (err) {
        console.error("Erro ao conectar ao banco:", err);
    } else {
        console.log("Banco SQLite conectado.");
    }
});

// ===============================
// CRIAÇÃO DAS TABELAS
// ===============================

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

db.run(`
    CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        token TEXT NOT NULL,
        expires_at DATETIME NOT NULL
    )
`);

// ===============================
// UPLOADS
// ===============================

const uploadDir = path.join(__dirname, "public/uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },

    filename: (req, file, cb) => {
        const unique =
            Date.now() +
            "_" +
            file.originalname.replace(/\s+/g, "_");

        cb(null, unique);
    }
});

const upload = multer({ storage });

// ===============================
// MIDDLEWARES
// ===============================

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(
    express.static(path.join(__dirname, "public"))
);

app.use(
    session({
        secret: "echonet-secret",
        resave: false,
        saveUninitialized: false
    })
);

// ===============================
// PÁGINA PRINCIPAL / FEED
// ===============================

app.get("/", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login.html");
    }

    db.all(
        "SELECT * FROM posts ORDER BY criado_em DESC",
        (err, posts) => {
            if (err) {
                console.error(err);
                return res.send("Erro ao carregar o feed.");
            }

            res.render("index", {
                username: req.session.user.username,
                posts,
                currentPage: "home"
            });
        }
    );
});

// ===============================
// PERFIL
// ===============================

app.get("/perfil", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login.html");
    }

    const username = req.session.user.username;

    db.all(
        "SELECT * FROM posts WHERE usuario = ? ORDER BY criado_em DESC",
        [username],
        (err, posts) => {
            if (err) {
                console.error(err);
                return res.send("Erro ao carregar o perfil.");
            }

            res.render("perfil", {
                username,
                posts,
                currentPage: "perfil"
            });
        }
    );
});

// ===============================
// DELETAR POST
// ===============================

app.post("/deletar-post/:id", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login.html");
    }

    const postId = req.params.id;
    const usuario = req.session.user.username;

    db.get(
        "SELECT * FROM posts WHERE id = ? AND usuario = ?",
        [postId, usuario],
        (err, post) => {
            if (err || !post) {
                return res.send(
                    "Post não encontrado ou não autorizado."
                );
            }

            const filePath = path.join(
                __dirname,
                "public",
                post.imagem
            );

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            db.run(
                "DELETE FROM posts WHERE id = ?",
                [postId],
                (err) => {
                    if (err) {
                        return res.send(
                            "Erro ao deletar o post."
                        );
                    }

                    res.redirect("/perfil");
                }
            );
        }
    );
});

// ===============================
// CRIAR POST
// ===============================

app.post(
    "/postar",
    upload.single("imagem"),
    (req, res) => {
        if (!req.session.user) {
            return res.redirect("/login.html");
        }

        const imagem = req.file
            ? "/uploads/" +
              encodeURIComponent(req.file.filename)
            : null;

        const legenda = req.body.legenda;
        const usuario = req.session.user.username;

        if (!imagem || !legenda) {
            return res.send(
                "Erro: campos obrigatórios."
            );
        }

        db.run(
            "INSERT INTO posts (imagem, legenda, usuario) VALUES (?, ?, ?)",
            [imagem, legenda, usuario],
            (err) => {
                if (err) {
                    console.error(err);
                    return res.send(
                        "Erro ao postar."
                    );
                }

                res.redirect("/");
            }
        );
    }
);

// ===============================
// CADASTRO
// ===============================

app.post("/register", (req, res) => {
    const {
        username,
        email,
        password,
        confirmPassword
    } = req.body;

    if (
        !username ||
        !email ||
        !password ||
        !confirmPassword
    ) {
        return res.json({
            success: false,
            message:
                "Todos os campos são obrigatórios."
        });
    }

    if (password !== confirmPassword) {
        return res.json({
            success: false,
            message:
                "As senhas não coincidem."
        });
    }

    db.get(
        "SELECT * FROM users WHERE email = ?",
        [email],
        (err, row) => {
            if (err) {
                console.error(err);

                return res.json({
                    success: false,
                    message:
                        "Erro no servidor."
                });
            }

            if (row) {
                return res.json({
                    success: false,
                    message:
                        "Este e-mail já está cadastrado."
                });
            }

            const hashedPassword =
                bcrypt.hashSync(password, 10);

            db.run(
                `INSERT INTO users
                (username, email, password)
                VALUES (?, ?, ?)`,
                [
                    username,
                    email,
                    hashedPassword
                ],
                function (err) {
                    if (err) {
                        console.error(err);

                        return res.json({
                            success: false,
                            message:
                                "Erro ao criar conta."
                        });
                    }

                    return res.json({
                        success: true,
                        message:
                            "Conta criada com sucesso."
                    });
                }
            );
        }
    );
});

// ===============================
// LOGIN
// ===============================

app.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.send(
            "Preencha todos os campos."
        );
    }

    db.get(
        "SELECT * FROM users WHERE email = ?",
        [email],
        async (err, user) => {
            if (err) {
                console.error(err);
                return res.send(
                    "Erro no servidor."
                );
            }

            if (!user) {
                return res.send(
                    "Usuário não encontrado. " +
                    "<a href='/login.html'>Tentar novamente</a>"
                );
            }

            const match =
                await bcrypt.compare(
                    password,
                    user.password
                );

            if (match) {
                req.session.user = {
                    id: user.id,
                    username: user.username,
                    email: user.email
                };

                res.redirect("/");
            } else {
                res.send(
                    "Senha incorreta. " +
                    "<a href='/login.html'>Tente novamente</a>"
                );
            }
        }
    );
});

// ===============================
// LOGOUT
// ===============================

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/login.html");
    });
});

// ===============================
// MENSAGENS - CONTATOS
// ===============================

app.get("/mensagens", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login.html");
    }

    const usuarioLogado =
        req.session.user.username;

    const queryContatos = `
        SELECT DISTINCT
            CASE
                WHEN remetente = ?
                THEN destinatario
                ELSE remetente
            END AS contato
        FROM messages
        WHERE remetente = ?
           OR destinatario = ?
        ORDER BY contato;
    `;

    db.all(
        queryContatos,
        [
            usuarioLogado,
            usuarioLogado,
            usuarioLogado
        ],
        (err, contatos) => {
            if (err) {
                console.error(err);
                return res.send(
                    "Erro ao carregar contatos."
                );
            }

            res.render("mensagens", {
                mensagens: [],
                usuarioLogado,
                destinatario: null,
                contatos,
                currentPage: "mensagens"
            });
        }
    );
});

// ===============================
// MENSAGENS - CONVERSA
// ===============================

app.get(
    "/mensagens/:destinatario",
    (req, res) => {
        if (!req.session.user) {
            return res.redirect("/login.html");
        }

        const usuarioLogado =
            req.session.user.username;

        const destinatario =
            decodeURIComponent(
                req.params.destinatario
            );

        if (
            destinatario.trim().toLowerCase() ===
            usuarioLogado.trim().toLowerCase()
        ) {
            return res.redirect("/mensagens");
        }

        const queryContatos = `
            SELECT DISTINCT
                CASE
                    WHEN remetente = ?
                    THEN destinatario
                    ELSE remetente
                END AS contato
            FROM messages
            WHERE remetente = ?
               OR destinatario = ?
            ORDER BY contato;
        `;

        const queryMensagens = `
            SELECT * FROM messages
            WHERE
                (remetente = ? AND destinatario = ?)
                OR
                (remetente = ? AND destinatario = ?)
            ORDER BY enviado_em ASC;
        `;

        db.all(
            queryContatos,
            [
                usuarioLogado,
                usuarioLogado,
                usuarioLogado
            ],
            (err, contatos) => {
                if (err) {
                    console.error(err);
                    return res.send(
                        "Erro ao carregar contatos."
                    );
                }

                db.all(
                    queryMensagens,
                    [
                        usuarioLogado,
                        destinatario,
                        destinatario,
                        usuarioLogado
                    ],
                    (err2, mensagens) => {
                        if (err2) {
                            console.error(err2);
                            return res.send(
                                "Erro ao carregar mensagens."
                            );
                        }

                        res.render(
                            "mensagens",
                            {
                                mensagens,
                                usuarioLogado,
                                destinatario,
                                contatos,
                                currentPage:
                                    "mensagens"
                            }
                        );
                    }
                );
            }
        );
    }
);

// ===============================
// ENVIAR MENSAGEM
// ===============================

app.post("/mensagens", (req, res) => {
    if (!req.session.user) {
        return res
            .status(401)
            .send("Não autenticado.");
    }

    const {
        destinatario,
        conteudo
    } = req.body;

    const remetente =
        req.session.user.username;

    if (!destinatario || !conteudo) {
        return res.send(
            "Destinatário e mensagem são obrigatórios."
        );
    }

    db.run(
        `INSERT INTO messages
        (remetente, destinatario, conteudo)
        VALUES (?, ?, ?)`,
        [
            remetente,
            destinatario,
            conteudo
        ],
        (err) => {
            if (err) {
                console.error(err);
                return res.send(
                    "Erro ao enviar mensagem."
                );
            }

            res.redirect(
                "/mensagens/" +
                encodeURIComponent(destinatario)
            );
        }
    );
});

// ===============================
// ATUALIZAR STATUS ONLINE
// ===============================

app.post("/atualizar-ativo", (req, res) => {
    const usuario =
        req.session.user?.username;

    if (!usuario) {
        return res.sendStatus(401);
    }

    const query = `
        UPDATE users
        SET ultimo_ativo = datetime('now')
        WHERE username = ?
    `;

    db.run(
        query,
        [usuario],
        (err) => {
            if (err) {
                console.error(err);
                return res.sendStatus(500);
            }

            res.sendStatus(200);
        }
    );
});

// ===============================
// USUÁRIOS ONLINE
// ===============================

app.get("/online-users", (req, res) => {
    const query = `
        SELECT
            username,
            CASE
                WHEN ultimo_ativo >= datetime(
                    'now',
                    '-1 minute'
                )
                THEN 'online'

                WHEN ultimo_ativo >= datetime(
                    'now',
                    '-5 minutes'
                )
                THEN 'away'

                ELSE 'offline'
            END AS status
        FROM users
        WHERE username != ?
        ORDER BY username;
    `;

    db.all(
        query,
        [req.session.user?.username],
        (err, rows) => {
            if (err) {
                console.error(err);
                return res.sendStatus(500);
            }

            res.json(rows);
        }
    );
});

// ===============================
// CONVERSAS
// ===============================

app.get("/conversas", (req, res) => {
    if (!req.session.user) {
        return res
            .status(401)
            .send("Não autenticado.");
    }

    const username =
        req.session.user.username;

    const query = `
        SELECT DISTINCT
            CASE
                WHEN remetente = ?
                THEN destinatario
                ELSE remetente
            END AS contato
        FROM messages
        WHERE remetente = ?
           OR destinatario = ?
        ORDER BY contato;
    `;

    db.all(
        query,
        [
            username,
            username,
            username
        ],
        (err, rows) => {
            if (err) {
                console.error(err);
                return res
                    .status(500)
                    .send("Erro interno.");
            }

            res.json(rows);
        }
    );
});

// ===============================
// LOGIN.HTML
// ===============================

app.get("/login.html", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "views/login.html"
        )
    );
});

// ===============================
// RECUPERAÇÃO DE SENHA
// ===============================

app.post("/recuperar-senha", (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.json({
            success: false,
            message: "Informe o email."
        });
    }

    db.get(
        "SELECT * FROM users WHERE email = ?",
        [email],
        (err, user) => {
            if (err) {
                console.error(err);

                return res.json({
                    success: false,
                    message:
                        "Erro no servidor."
                });
            }

            if (!user) {
                return res.json({
                    success: true,
                    message:
                        "Se o email existir, um link foi enviado."
                });
            }

            const token =
                crypto
                    .randomBytes(20)
                    .toString("hex");

            const expiresAt =
                new Date(
                    Date.now() + 3600 * 1000
                ).toISOString();

            db.run(
                `INSERT INTO password_resets
                (email, token, expires_at)
                VALUES (?, ?, ?)`,
                [
                    email,
                    token,
                    expiresAt
                ],
                (err) => {
                    if (err) {
                        console.error(err);

                        return res.json({
                            success: false,
                            message:
                                "Erro ao gerar token."
                        });
                    }

                    const link =
                        `http://localhost:${PORT}/resetar-senha?token=${token}`;

                    console.log(
                        `Link de recuperação para ${email}: ${link}`
                    );

                    return res.json({
                        success: true,
                        message:
                            "Se o email existir, um link foi enviado."
                    });
                }
            );
        }
    );
});

// ===============================
// PÁGINA DE RESETAR SENHA
// ===============================

app.get("/resetar-senha", (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.send(
            "Token inválido."
        );
    }

    db.get(
        "SELECT * FROM password_resets WHERE token = ?",
        [token],
        (err, row) => {
            if (err || !row) {
                return res.send(
                    "Token inválido ou expirado."
                );
            }

            const now = new Date();
            const expiresAt =
                new Date(row.expires_at);

            if (expiresAt < now) {
                return res.send(
                    "Token expirado."
                );
            }

            res.render(
                "resetar-senha",
                { token }
            );
        }
    );
});

// ===============================
// ATUALIZAR SENHA
// ===============================

app.post("/resetar-senha", (req, res) => {
    const {
        token,
        password,
        confirmPassword
    } = req.body;

    if (
        !token ||
        !password ||
        !confirmPassword
    ) {
        return res.json({
            success: false,
            message:
                "Campos obrigatórios."
        });
    }

    if (password !== confirmPassword) {
        return res.json({
            success: false,
            message:
                "As senhas não coincidem."
        });
    }

    db.get(
        "SELECT * FROM password_resets WHERE token = ?",
        [token],
        (err, row) => {
            if (err || !row) {
                return res.json({
                    success: false,
                    message:
                        "Token inválido ou expirado."
                });
            }

            const now = new Date();
            const expiresAt =
                new Date(row.expires_at);

            if (expiresAt < now) {
                return res.json({
                    success: false,
                    message:
                        "Token expirado."
                });
            }

            const hashedPassword =
                bcrypt.hashSync(
                    password,
                    10
                );

            db.run(
                "UPDATE users SET password = ? WHERE email = ?",
                [
                    hashedPassword,
                    row.email
                ],
                (err) => {
                    if (err) {
                        console.error(err);

                        return res.json({
                            success: false,
                            message:
                                "Erro ao atualizar senha."
                        });
                    }

                    db.run(
                        "DELETE FROM password_resets WHERE token = ?",
                        [token]
                    );

                    return res.json({
                        success: true,
                        message:
                            "Senha atualizada com sucesso."
                    });
                }
            );
        }
    );
});

// ===============================
// INICIAR SERVIDOR
// ===============================

app.listen(PORT, "0.0.0.0", () => {
    const interfaces = os.networkInterfaces();
    let localIp = "localhost";

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === "IPv4" && !iface.internal) {
                localIp = iface.address;
                break;
            }
        }
    }

    console.log(`EchoNet rodando em http://localhost:${PORT}`);
    console.log(`Acesse pelo celular (mesma rede Wi-Fi): http://${localIp}:${PORT}`);
});