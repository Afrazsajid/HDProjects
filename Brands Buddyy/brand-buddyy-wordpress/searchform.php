<?php
/**
 * Search form.
 *
 * @package Brand_Buddyy
 */
?>
<form role="search" method="get" class="bb-search-form" action="<?php echo esc_url( home_url( '/' ) ); ?>">
	<label class="screen-reader-text" for="brand-buddyy-search"><?php esc_html_e( 'Search for:', 'brand-buddyy' ); ?></label>
	<input id="brand-buddyy-search" type="search" name="s" value="<?php echo esc_attr( get_search_query() ); ?>" placeholder="<?php esc_attr_e( 'Search insights…', 'brand-buddyy' ); ?>">
	<button class="bb-button" type="submit"><?php esc_html_e( 'Search', 'brand-buddyy' ); ?></button>
</form>
