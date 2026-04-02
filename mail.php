<?php

header('Content-Type: application/json');


if ($_SERVER["REQUEST_METHOD"] == "POST") {
    

    $name = strip_tags(trim($_POST["name"]));
    $name = str_replace(array("\r","\n"),array(" "," "),$name);
    
    $phone = strip_tags(trim($_POST["phone"]));
    $email = filter_var(trim($_POST["email"]), FILTER_SANITIZE_EMAIL);
    $message = trim($_POST["message"]);


    if ( empty($name) OR empty($phone) OR !filter_var($email, FILTER_VALIDATE_EMAIL)) {

        http_response_code(400);
        echo json_encode(["status" => "error", "message" => "Пожалуйста, заполните форму корректно."]);
        exit;
    }


    $recipient = "rosatomicalchemist@gmail.com";


    $subject = "Новая заявка с сайта GROSGROUP от $name";

    $email_content = "Имя: $name\n";
    $email_content .= "Телефон: $phone\n";
    $email_content .= "Email: $email\n\n";
    $email_content .= "Сообщение:\n$message\n";

    $email_headers = "From: GROSGROUP Site <noreply@grosgroup.ru>\r\nReply-To: $email";

    if (mail($recipient, $subject, $email_content, $email_headers)) {
        http_response_code(200);
        echo json_encode(["status" => "success", "message" => "Ваше сообщение успешно отправлено."]);
    } else {
        http_response_code(500);
        echo json_encode(["status" => "error", "message" => "Ошибка отправки письма. Попробуйте позже."]);
    }

} else {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Доступ запрещен."]);
}
?>
