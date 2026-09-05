<?php
// save-response.php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["success" => false, "error" => "Method Not Allowed"]);
    exit();
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "Invalid JSON payload"]);
    exit();
}

$xmlContent = isset($data['xmlString']) ? $data['xmlString'] : '';

if (empty($xmlContent)) {
    http_response_code(400);
    echo json_encode(["success" => false, "error" => "No XML content provided"]);
    exit();
}

$company = isset($data['respondent']['company']) ? $data['respondent']['company'] : 'Assessment';
$sanitizedCompany = preg_replace('/[^a-zA-Z0-9_-]/', '_', substr($company, 0, 30));
$timestamp = date('Y-m-d_H-i-s');
$filename = "response_{$sanitizedCompany}_{$timestamp}.xml";

// Define directory (saves into poongudi/responses/)
$targetDir = __DIR__ . '/responses/';
if (!file_exists($targetDir)) {
    mkdir($targetDir, 0755, true);
}

$filePath = $targetDir . $filename;

if (file_put_contents($filePath, $xmlContent) !== false) {
    http_response_code(200);
    echo json_encode([
        "success" => true,
        "message" => "XML saved successfully",
        "filename" => $filename,
        "url" => "http://gravity-innovations.com/poongudi/responses/" . $filename
    ]);
} else {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "Failed to write XML file to disk"]);
}
