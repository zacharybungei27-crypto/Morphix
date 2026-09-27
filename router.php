<?php
/**
 * Morphix SPA router for `php -S localhost:9000 router.php`
 *
 * Serves real files (JS, CSS, images, fonts) directly and falls back to
 * index.html for every other path so History-API URLs like /register,
 * /studio/base work without a hash.
 */

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = __DIR__ . $path;

// Serve existing files (and directories' index) directly
if ($path !== '/' && is_file($file)) {
    return false;
}

// Everything else → the SPA shell
require __DIR__ . '/index.html';