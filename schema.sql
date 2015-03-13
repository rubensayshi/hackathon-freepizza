DROP TABLE IF EXISTS `peer`;
CREATE TABLE `peer` (
    `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
    `hash` VARCHAR(255) NOT NULL,
    `ipv4` VARCHAR(50) NULL,
    `ipv6` VARCHAR(50) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY(`hash`)
);

DROP TABLE IF EXISTS `experiment`;
CREATE TABLE `experiment` (
    `id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
    `tx1_raw` BLOB NOT NULL,
    `tx1_hash` VARCHAR(64) NOT NULL,
    `tx2_raw` BLOB NOT NULL,
    `tx2_hash` VARCHAR(64) NOT NULL,
    PRIMARY KEY (`id`)
);

DROP TABLE IF EXISTS `experiment_peer`;
CREATE TABLE `experiment_peer` (
    `experiment_id` INT(11) UNSIGNED NOT NULL,
    `peer_id` INT(11) UNSIGNED NOT NULL,
    `tx` INT(1) UNSIGNED NOT NULL,
    PRIMARY KEY (`experiment_id`, `peer_id`)
);
