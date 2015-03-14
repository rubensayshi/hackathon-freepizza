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
    `started` INT(11) NOT NULL,
    PRIMARY KEY (`id`)
);

DROP TABLE IF EXISTS `experiment_chunk`;
CREATE TABLE `experiment_chunk` (
    `chunk_id` INT(11) UNSIGNED NOT NULL AUTO_INCREMENT,
    `experiment_id` INT(11) UNSIGNED NOT NULL,
    `ichunk` INT(2) UNSIGNED NOT NULL,
    `tx_hash` VARCHAR(64) NOT NULL,
    `tx_raw` BLOB NOT NULL,
    PRIMARY KEY (`chunk_id`),
    UNIQUE KEY `experiment_ichunk` (`experiment_id`, `ichunk`)
);

DROP TABLE IF EXISTS `experiment_peer`;
CREATE TABLE `experiment_peer` (
    `chunk_id` INT(11) UNSIGNED NOT NULL,
    `peer_id` INT(11) UNSIGNED NOT NULL,
    PRIMARY KEY (`chunk_id`, `peer_id`)
);
